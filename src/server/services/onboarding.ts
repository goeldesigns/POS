import type { OrderType } from "@/generated/prisma/enums";
import { CORE_MODULES, MODULE_KEYS, isModuleKey, type ModuleKey } from "@/lib/permissions/catalog";
import { SYSTEM_ROLES } from "@/lib/permissions/defaults";
import { slugify } from "@/lib/utils";
import { prisma } from "../db";
import { ConflictError, NotFoundError } from "../errors";
import { hashPassword } from "../auth/password";
import { ensurePermissionCatalog } from "./catalog-sync";

export interface CreateTenantInput {
  profile: {
    name: string;
    legalName?: string | null;
    ownerName: string;
    email: string;
    phone: string;
    addressLine?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string;
    postalCode?: string | null;
    gstNumber?: string | null;
    fssaiNumber?: string | null;
    currency?: string;
    timezone?: string;
    restaurantType?: string;
  };
  config?: {
    numberOfTables?: number;
    taxRate?: number;
    taxInclusive?: boolean;
    serviceChargePercent?: number;
    defaultOrderType?: OrderType;
    receiptHeader?: string | null;
    receiptFooter?: string | null;
  };
  owner: { name: string; email: string; password: string; phone?: string | null };
  planKey: string;
  /** Explicit module selection; omitted → the plan's modules. */
  modules?: string[] | null;
}

const DEFAULT_CATEGORIES: Record<string, string[]> = {
  Cafe: ["Coffee", "Tea & Infusions", "Beverages", "Breakfast", "Sandwiches", "Desserts", "Sides", "Combos"],
  "Bakery & Desserts": ["Cakes", "Pastries", "Breads", "Cookies", "Beverages", "Combos"],
  "Bar & Lounge": ["Cocktails", "Mocktails", "Beverages", "Starters", "Main Course", "Desserts", "Combos"],
  default: ["Starters", "Main Course", "Breads", "Rice & Biryani", "Beverages", "Desserts", "Sides", "Combos"],
};

const CATEGORY_COLORS = ["#5040D0", "#F59E0B", "#22A06B", "#E5484D", "#3B82F6", "#D946EF", "#0EA5E9", "#64748B"];

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "restaurant";
  let candidate = base;
  for (let i = 2; await prisma.restaurant.findUnique({ where: { slug: candidate }, select: { id: true } }); i++) {
    candidate = `${base}-${i}`;
  }
  return candidate;
}

/** Modules switched on by a plan (core modules always on). */
export async function planModuleKeys(planKey: string): Promise<ModuleKey[]> {
  const plan = await prisma.plan.findUnique({ where: { key: planKey }, include: { features: true } });
  if (!plan) throw new NotFoundError("Plan");
  const keys = new Set<ModuleKey>(CORE_MODULES);
  for (const f of plan.features) if (f.enabled && isModuleKey(f.featureKey)) keys.add(f.featureKey);
  return [...keys];
}

/**
 * Create a complete, ready-to-use tenant in one transaction:
 * restaurant → settings → tax → roles → owner login → modules → subscription →
 * categories → floor & tables → loyalty programme → integration slots.
 */
export async function createRestaurantTenant(input: CreateTenantInput) {
  await ensurePermissionCatalog();

  const ownerEmail = input.owner.email.trim().toLowerCase();
  const existingUser = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (existingUser) throw new ConflictError("An account with this login email already exists");

  const plan = await prisma.plan.findUnique({ where: { key: input.planKey } });
  if (!plan) throw new NotFoundError("Plan");

  const enabledModules = new Set<string>(
    input.modules && input.modules.length > 0
      ? [...input.modules.filter(isModuleKey), ...CORE_MODULES]
      : await planModuleKeys(input.planKey),
  );

  const passwordHash = await hashPassword(input.owner.password);
  const slug = await uniqueSlug(input.profile.name);
  const cfg = input.config ?? {};
  const restaurantType = input.profile.restaurantType ?? "Casual Dining";
  const categories = DEFAULT_CATEGORIES[restaurantType] ?? DEFAULT_CATEGORIES.default!;
  const tableCount = Math.max(0, Math.min(cfg.numberOfTables ?? 10, plan.maxTables ?? 500));
  const now = new Date();
  const periodEnd = new Date(now.getTime() + Math.max(plan.trialDays, 1) * 86_400_000);

  return prisma.$transaction(
    async (tx) => {
      const restaurant = await tx.restaurant.create({
        data: {
          slug,
          name: input.profile.name,
          legalName: input.profile.legalName ?? null,
          ownerName: input.profile.ownerName,
          email: input.profile.email,
          phone: input.profile.phone,
          addressLine: input.profile.addressLine ?? null,
          city: input.profile.city ?? null,
          state: input.profile.state ?? null,
          country: input.profile.country ?? "India",
          postalCode: input.profile.postalCode ?? null,
          gstNumber: input.profile.gstNumber ?? null,
          fssaiNumber: input.profile.fssaiNumber ?? null,
          currency: input.profile.currency ?? "INR",
          timezone: input.profile.timezone ?? "Asia/Kolkata",
          restaurantType,
          lastActiveAt: now,
        },
      });
      const restaurantId = restaurant.id;

      await tx.restaurantSettings.create({
        data: {
          restaurantId,
          taxInclusive: cfg.taxInclusive ?? false,
          serviceChargePercent: cfg.serviceChargePercent ?? 0,
          defaultOrderType: cfg.defaultOrderType ?? "DINE_IN",
          receiptHeader: cfg.receiptHeader ?? null,
          receiptFooter: cfg.receiptFooter ?? "Thank you for dining with us!",
        },
      });

      const rate = cfg.taxRate ?? 5;
      await tx.taxRate.createMany({
        data: [
          { restaurantId, name: `GST ${rate}%`, rate, isDefault: true },
          ...(rate !== 18 ? [{ restaurantId, name: "GST 18%", rate: 18 }] : []),
          { restaurantId, name: "Exempt", rate: 0 },
        ],
      });

      let ownerRoleId = "";
      for (const template of SYSTEM_ROLES) {
        const role = await tx.role.create({
          data: {
            restaurantId,
            name: template.name,
            description: template.description,
            isSystem: true,
            isOwner: template.isOwner ?? false,
            permissions: { create: template.permissions.map((permissionKey) => ({ permissionKey })) },
          },
        });
        if (template.isOwner) ownerRoleId = role.id;
      }

      const owner = await tx.user.create({
        data: {
          email: ownerEmail,
          name: input.owner.name,
          phone: input.owner.phone ?? input.profile.phone,
          passwordHash,
        },
      });

      const membership = await tx.restaurantUser.create({
        data: { restaurantId, userId: owner.id, roleId: ownerRoleId },
      });

      await tx.staffMember.create({
        data: {
          restaurantId,
          restaurantUserId: membership.id,
          name: input.owner.name,
          email: ownerEmail,
          phone: input.owner.phone ?? input.profile.phone,
          roleTitle: "Owner",
          employeeCode: "EMP-001",
          joiningDate: now,
        },
      });

      await tx.restaurantModule.createMany({
        data: MODULE_KEYS.map((moduleKey) => ({ restaurantId, moduleKey, enabled: enabledModules.has(moduleKey) })),
      });

      await tx.subscription.create({
        data: {
          restaurantId,
          planId: plan.id,
          status: plan.trialDays > 0 ? "TRIALING" : "ACTIVE",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          trialEndsAt: plan.trialDays > 0 ? periodEnd : null,
        },
      });

      await tx.category.createMany({
        data: categories.map((name, i) => ({
          restaurantId,
          name,
          sortOrder: i,
          color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
        })),
      });

      if (tableCount > 0) {
        const floor = await tx.floor.create({ data: { restaurantId, name: "Main Hall", sortOrder: 0 } });
        await tx.diningTable.createMany({
          data: Array.from({ length: tableCount }, (_, i) => ({
            restaurantId,
            floorId: floor.id,
            name: `T${String(i + 1).padStart(2, "0")}`,
            capacity: i % 3 === 0 ? 2 : 4,
            sortOrder: i,
          })),
        });
      }

      await tx.loyaltyProgram.create({ data: { restaurantId } });

      await tx.integration.createMany({
        data: [
          { restaurantId, provider: "SWIGGY" },
          { restaurantId, provider: "ZOMATO" },
        ],
      });

      return { restaurant, owner, membershipId: membership.id };
    },
    { timeout: 20_000 },
  );
}
