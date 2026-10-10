import type { Prisma } from "@/generated/prisma/client";
import type { ServiceContext } from "../auth/load-context";
import { assertPermission } from "../auth/guards-core";
import { audit } from "../audit";
import { ConflictError, NotFoundError } from "../errors";
import { parseListParams, param, type SearchParams } from "../list-params";

const normalisePhone = (p: string) => p.replace(/[^\d+]/g, "");

export function customerWhere(sp: SearchParams): Prisma.CustomerWhereInput {
  const and: Prisma.CustomerWhereInput[] = [{ deletedAt: null }];
  const q = (param(sp, "q") ?? "").trim();
  if (q) {
    const digits = q.replace(/\D/g, "");
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
      ],
    });
  }
  const tag = param(sp, "tag");
  if (tag) and.push({ tags: { has: tag } });
  const segment = param(sp, "segment");
  const now = Date.now();
  if (segment === "new") and.push({ createdAt: { gte: new Date(now - 30 * 86_400_000) } });
  if (segment === "repeat") and.push({ totalOrders: { gte: 2 } });
  if (segment === "lapsed") and.push({ lastVisitAt: { lt: new Date(now - 60 * 86_400_000) } });
  if (segment === "vip") and.push({ OR: [{ tags: { has: "VIP" } }, { totalSpend: { gte: 2_000_000 } }] });
  return { AND: and };
}

export async function listCustomers(ctx: ServiceContext, sp: SearchParams) {
  const p = parseListParams(sp, { sortable: ["name", "totalSpend", "totalOrders", "lastVisitAt", "createdAt"] as const, defaultSort: "lastVisitAt" });
  const where = customerWhere(sp);
  const orderBy: Prisma.CustomerOrderByWithRelationInput =
    p.sort === "lastVisitAt" ? { lastVisitAt: { sort: p.dir, nulls: "last" } } : { [p.sort]: p.dir };
  const [rows, total, stats, tags] = await Promise.all([
    ctx.db.customer.findMany({ where, orderBy, skip: p.skip, take: p.pageSize, include: { loyalty: { select: { balance: true } } } }),
    ctx.db.customer.count({ where }),
    ctx.db.customer.aggregate({ where: { deletedAt: null }, _count: true, _sum: { totalSpend: true, totalOrders: true } }),
    ctx.db.customer.findMany({ where: { deletedAt: null, NOT: { tags: { isEmpty: true } } }, select: { tags: true }, take: 2000 }),
  ]);
  const [newThisMonth, repeat] = await Promise.all([
    ctx.db.customer.count({ where: { deletedAt: null, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
    ctx.db.customer.count({ where: { deletedAt: null, totalOrders: { gte: 2 } } }),
  ]);
  return {
    params: p,
    total,
    tags: [...new Set(tags.flatMap((t) => t.tags))].sort(),
    stats: {
      customers: stats._count,
      newThisMonth,
      repeatRate: stats._count ? (repeat / stats._count) * 100 : 0,
      avgSpend: stats._count ? Math.round((stats._sum.totalSpend ?? 0) / stats._count) : 0,
    },
    rows: rows.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      tags: c.tags,
      totalOrders: c.totalOrders,
      totalSpend: c.totalSpend,
      aov: c.totalOrders ? Math.round(c.totalSpend / c.totalOrders) : 0,
      points: c.loyalty?.balance ?? 0,
      lastVisitAt: c.lastVisitAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      birthday: c.birthday?.toISOString() ?? null,
    })),
  };
}

export type CustomerRow = Awaited<ReturnType<typeof listCustomers>>["rows"][number];

export async function getCustomerProfile(ctx: ServiceContext, id: string) {
  const c = await ctx.db.customer.findFirst({
    where: { id, deletedAt: null },
    include: {
      addresses: { orderBy: { isDefault: "desc" } },
      notes: { orderBy: { createdAt: "desc" } },
      loyalty: true,
    },
  });
  if (!c) throw new NotFoundError("Customer");
  const [orders, reservations, favourites, loyaltyTxns] = await Promise.all([
    ctx.db.order.findMany({
      where: { customerId: id, status: { not: "DRAFT" } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, orderNumber: true, createdAt: true, type: true, total: true, status: true, paymentStatus: true, table: { select: { name: true } }, _count: { select: { items: true } } },
    }),
    ctx.db.reservation.findMany({ where: { customerId: id }, orderBy: { startsAt: "desc" }, take: 30, include: { table: { select: { name: true } } } }),
    ctx.db.orderItem.groupBy({
      by: ["name"],
      where: { order: { customerId: id, status: "COMPLETED" } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),
    c.loyalty ? ctx.db.loyaltyTransaction.findMany({ where: { accountId: c.loyalty.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50 }) : Promise.resolve([]),
  ]);
  return { customer: c, orders, reservations, favourites: favourites.map((f) => ({ name: f.name, quantity: f._sum.quantity ?? 0 })), loyaltyTxns };
}

export interface CustomerInput {
  id?: string;
  name: string;
  phone: string;
  email: string | null;
  birthday: Date | null;
  anniversary: Date | null;
  tags: string;
  addressLine1: string | null;
  addressCity: string | null;
  addressPostalCode: string | null;
}

export async function saveCustomer(ctx: ServiceContext, input: CustomerInput) {
  assertPermission(ctx, input.id ? "customers.edit" : "customers.create");
  const phone = normalisePhone(input.phone);
  const clash = await ctx.db.customer.findFirst({ where: { phone, ...(input.id ? { id: { not: input.id } } : {}) } });
  if (clash) throw new ConflictError(`${clash.name} already uses this phone number`);
  const tags = [...new Set(input.tags.split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 10);
  const data = { name: input.name, phone, email: input.email, birthday: input.birthday, anniversary: input.anniversary, tags };

  const id = input.id
    ? (await ctx.db.customer.update({ where: { id: input.id }, data })).id
    : (await ctx.db.customer.create({ data: { ...data, restaurantId: ctx.restaurantId } })).id;

  if (input.addressLine1) {
    const existing = await ctx.db.customerAddress.findFirst({ where: { customerId: id, isDefault: true } });
    const addr = { line1: input.addressLine1, city: input.addressCity ?? "", postalCode: input.addressPostalCode };
    if (existing) await ctx.db.customerAddress.update({ where: { id: existing.id }, data: addr });
    else await ctx.db.customerAddress.create({ data: { ...addr, restaurantId: ctx.restaurantId, customerId: id, isDefault: true } });
  }
  await audit(ctx, { action: input.id ? "customer.updated" : "customer.created", entity: "Customer", entityId: id, summary: `${ctx.actor.name} ${input.id ? "updated" : "added"} customer ${input.name}` });
  return id;
}

export async function deleteCustomer(ctx: ServiceContext, id: string) {
  assertPermission(ctx, "customers.delete");
  const c = await ctx.db.customer.findFirst({ where: { id, deletedAt: null } });
  if (!c) throw new NotFoundError("Customer");
  // Soft delete: orders keep their snapshot; personal data is cleared.
  await ctx.db.customer.update({
    where: { id },
    data: { deletedAt: new Date(), phone: `deleted-${id}`, email: null, birthday: null, anniversary: null, tags: [] },
  });
  await ctx.db.customerAddress.deleteMany({ where: { customerId: id } });
  await audit(ctx, { action: "customer.deleted", entity: "Customer", entityId: id, summary: `${ctx.actor.name} deleted customer ${c.name}` });
}

export async function addCustomerNote(ctx: ServiceContext, customerId: string, body: string) {
  assertPermission(ctx, "customers.edit");
  const c = await ctx.db.customer.findFirst({ where: { id: customerId, deletedAt: null } });
  if (!c) throw new NotFoundError("Customer");
  await ctx.db.customerNote.create({ data: { restaurantId: ctx.restaurantId, customerId, body, authorName: ctx.actor.name } });
}

export async function importCustomers(
  ctx: ServiceContext,
  rows: { name: string; phone: string; email?: string | null; birthday?: string | null; tags?: string | null }[],
) {
  assertPermission(ctx, "customers.create");
  let created = 0;
  let updated = 0;
  const errors: { row: number; message: string }[] = [];
  for (const [i, r] of rows.entries()) {
    const phone = normalisePhone(r.phone ?? "");
    const name = (r.name ?? "").trim();
    if (!name || phone.replace(/\D/g, "").length < 7) {
      errors.push({ row: i + 2, message: !name ? "Missing name" : "Invalid phone" });
      continue;
    }
    const email = r.email && /.+@.+\..+/.test(r.email) ? r.email.toLowerCase() : null;
    const birthday = r.birthday && /^\d{4}-\d{2}-\d{2}$/.test(r.birthday) ? new Date(`${r.birthday}T12:00:00Z`) : null;
    const tags = (r.tags ?? "").split(/[;,]/).map((t) => t.trim()).filter(Boolean);
    const existing = await ctx.db.customer.findFirst({ where: { phone } });
    if (existing) {
      await ctx.db.customer.update({
        where: { id: existing.id },
        data: { name, email: email ?? existing.email, birthday: birthday ?? existing.birthday, tags: [...new Set([...existing.tags, ...tags])], deletedAt: null },
      });
      updated++;
    } else {
      await ctx.db.customer.create({ data: { restaurantId: ctx.restaurantId, name, phone, email, birthday, tags } });
      created++;
    }
  }
  await audit(ctx, { action: "customer.imported", entity: "Customer", summary: `${ctx.actor.name} imported customers (${created} new, ${updated} updated)` });
  return { created, updated, errors: errors.slice(0, 50), skipped: errors.length };
}
