"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  profileSchema,
  resetPasswordSchema,
  selectRestaurantSchema,
  signupSchema,
} from "@/lib/validation/auth";
import { prisma } from "../db";
import { generateToken, hashToken } from "../crypto";
import { mailer } from "../mailer";
import { enforceRateLimit, RATE_LIMITS } from "../rate-limit";
import { auditPlatform } from "../audit";
import { ForbiddenError, UnauthorizedError, ValidationError, AppError } from "../errors";
import { burnPasswordCheck, hashPassword, verifyPassword } from "../auth/password";
import { createSession, revokeSession, revokeUserSessions, SESSION_COOKIE, switchSessionRestaurant } from "../auth/session";
import { getPlatformContext, getRequestMeta, getRestaurantContext, systemContext } from "../auth/context";
import { publicAction, restaurantAction, platformAction } from "../action";
import { createRestaurantTenant } from "../services/onboarding";
import { audit } from "../audit";

const INVALID_LOGIN = "That email and password combination didn't work";

function safeNext(next: string | undefined, fallback: string, prefix: string) {
  if (next && next.startsWith(prefix) && !next.startsWith("//")) return next;
  return fallback;
}

async function setSessionCookie(name: string, token: string, expires: Date) {
  (await cookies()).set(name, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

async function activeMemberships(userId: string) {
  return prisma.restaurantUser.findMany({
    where: { userId, status: "ACTIVE", restaurant: { status: { not: "ARCHIVED" }, deletedAt: null } },
    include: { restaurant: { select: { id: true, name: true, city: true, status: true } }, role: { select: { name: true } } },
    orderBy: [{ lastActiveAt: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
  });
}

// ─── Restaurant login ───────────────────────────────────────────────────────

export const loginAction = publicAction(loginSchema, async (input) => {
  const meta = await getRequestMeta();
  await enforceRateLimit(`login:${meta.ip}:${input.email}`, RATE_LIMITS.login);

  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    await burnPasswordCheck(input.password);
    throw new UnauthorizedError(INVALID_LOGIN);
  }
  if (!(await verifyPassword(input.password, user.passwordHash))) throw new UnauthorizedError(INVALID_LOGIN);
  if (user.status !== "ACTIVE") throw new ForbiddenError("This account has been disabled. Contact your restaurant owner.");

  const memberships = await activeMemberships(user.id);
  if (memberships.length === 0) {
    // One front door: platform administrators are sent to the console.
    if (user.platformRole) return startAdminSession(user, input, meta);
    throw new ForbiddenError("Your access to this restaurant has been suspended. Contact the owner.");
  }

  const primary = memberships[0]!;
  const { token, expiresAt } = await createSession({
    userId: user.id,
    scope: "RESTAURANT",
    restaurantId: primary.restaurantId,
    remember: input.remember,
    meta,
  });
  await setSessionCookie(SESSION_COOKIE.RESTAURANT, token, expiresAt);
  const now = new Date();
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
  await prisma.restaurantUser.update({ where: { id: primary.id }, data: { lastActiveAt: now } });
  await prisma.restaurant.update({ where: { id: primary.restaurantId }, data: { lastActiveAt: now } });
  await audit(
    { ...systemContext(primary.restaurantId), actor: { userId: user.id, name: user.name, role: primary.role.name }, meta },
    { action: "user.login", entity: "User", entityId: user.id, summary: `${user.name} signed in` },
  );

  const next = safeNext(input.next, "/app", "/app");
  return { redirectTo: memberships.length > 1 ? `/auth/select-restaurant?next=${encodeURIComponent(next)}` : next };
});

export const selectRestaurantAction = restaurantAction(
  { schema: selectRestaurantSchema, revalidate: false },
  async (input, ctx) => {
    const membership = await prisma.restaurantUser.findUnique({
      where: { restaurantId_userId: { restaurantId: input.restaurantId, userId: ctx.user.id } },
      include: { restaurant: true },
    });
    if (!membership || membership.status !== "ACTIVE" || membership.restaurant.status === "ARCHIVED") {
      throw new ForbiddenError("You don't have access to that restaurant");
    }
    const token = (await cookies()).get(SESSION_COOKIE.RESTAURANT)?.value;
    if (!token) throw new UnauthorizedError();
    await switchSessionRestaurant(token, input.restaurantId);
    await prisma.restaurantUser.update({ where: { id: membership.id }, data: { lastActiveAt: new Date() } });
    return { name: membership.restaurant.name };
  },
);

export async function listMyRestaurants() {
  const ctx = await getRestaurantContext();
  if (!ctx) return [];
  const memberships = await activeMemberships(ctx.user.id);
  return memberships.map((m) => ({
    id: m.restaurantId,
    name: m.restaurant.name,
    city: m.restaurant.city,
    role: m.role.name,
    suspended: m.restaurant.status === "SUSPENDED",
    current: m.restaurantId === ctx.restaurantId,
  }));
}

export async function logoutAction() {
  const store = await cookies();
  await revokeSession(store.get(SESSION_COOKIE.RESTAURANT)?.value);
  store.delete(SESSION_COOKIE.RESTAURANT);
  redirect("/auth/login");
}

// ─── Signup (self-serve tenant creation) ────────────────────────────────────

async function platformSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.platformSetting.findUnique({ where: { key } });
  return (row?.value as T) ?? fallback;
}

export const signupAction = publicAction(signupSchema, async (input) => {
  const meta = await getRequestMeta();
  await enforceRateLimit(`signup:${meta.ip}`, RATE_LIMITS.signup);
  if (!(await platformSetting("allowSelfSignup", true))) {
    throw new ForbiddenError("New sign-ups are paused. Contact our team to get started.");
  }
  const planKey = await platformSetting("defaultPlanKey", "starter");
  const { restaurant, owner } = await createRestaurantTenant({
    profile: { name: input.restaurantName, ownerName: input.ownerName, email: input.email, phone: input.phone },
    config: { numberOfTables: 10 },
    owner: { name: input.ownerName, email: input.email, password: input.password, phone: input.phone },
    planKey,
  });
  await auditPlatform(
    { actor: { userId: owner.id, name: owner.name, role: "Owner" }, meta },
    { action: "restaurant.signup", entity: "Restaurant", entityId: restaurant.id, restaurantId: restaurant.id, summary: `${restaurant.name} signed up (${planKey} trial)` },
  );
  const { token, expiresAt } = await createSession({ userId: owner.id, scope: "RESTAURANT", restaurantId: restaurant.id, meta });
  await setSessionCookie(SESSION_COOKIE.RESTAURANT, token, expiresAt);
  return { redirectTo: "/app/overview?welcome=1" };
});

// ─── Password reset ─────────────────────────────────────────────────────────

export const forgotPasswordAction = publicAction(forgotPasswordSchema, async (input) => {
  const meta = await getRequestMeta();
  await enforceRateLimit(`reset:${meta.ip}`, RATE_LIMITS.passwordReset);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (user && user.status === "ACTIVE") {
    const token = generateToken();
    await prisma.passwordResetToken.create({
      data: { tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + 30 * 60_000) },
    });
    const base = process.env.APP_URL ?? "http://localhost:3000";
    await mailer.send({
      to: user.email,
      subject: "Reset your Tabla password",
      text: `Hi ${user.name},\n\nUse this link to choose a new password (valid for 30 minutes):\n${base}/auth/reset-password?token=${token}\n\nIf you didn't ask for this, you can ignore this email.`,
    });
  }
  // Same response either way — never reveal whether an email is registered.
  return { sent: true };
});

export const resetPasswordAction = publicAction(resetPasswordSchema, async (input) => {
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(input.token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new ValidationError("This reset link has expired. Request a new one.");
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash: await hashPassword(input.password) } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
  await revokeUserSessions(record.userId);
  return { done: true };
});

// ─── Profile (restaurant users) ─────────────────────────────────────────────

export const updateProfileAction = restaurantAction({ schema: profileSchema }, async (input, ctx) => {
  await prisma.user.update({ where: { id: ctx.user.id }, data: { name: input.name, phone: input.phone } });
  return { ok: true };
});

export const changePasswordAction = restaurantAction({ schema: changePasswordSchema }, async (input, ctx) => {
  await changePassword(ctx.user.id, input.currentPassword, input.newPassword, SESSION_COOKIE.RESTAURANT);
  return { ok: true };
});

async function changePassword(userId: string, current: string, next: string, cookieName: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(current, user.passwordHash))) {
    throw new AppError("Your current password is incorrect", { status: 422, fieldErrors: { currentPassword: ["Your current password is incorrect"] } });
  }
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
  const token = (await cookies()).get(cookieName)?.value;
  await revokeUserSessions(userId, { exceptTokenHash: token ? hashToken(token) : undefined });
}

// ─── Super Admin auth ───────────────────────────────────────────────────────

export const adminLoginAction = publicAction(loginSchema, async (input) => {
  const meta = await getRequestMeta();
  await enforceRateLimit(`admin-login:${meta.ip}:${input.email}`, RATE_LIMITS.login);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    await burnPasswordCheck(input.password);
    throw new UnauthorizedError(INVALID_LOGIN);
  }
  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid || !user.platformRole || user.status !== "ACTIVE") throw new UnauthorizedError(INVALID_LOGIN);
  return startAdminSession(user, input, meta);
});

/** Platform console session for a verified, active administrator. */
async function startAdminSession(
  user: { id: string; name: string },
  input: { remember?: boolean; next?: string },
  meta: Awaited<ReturnType<typeof getRequestMeta>>,
) {
  const { token, expiresAt } = await createSession({ userId: user.id, scope: "PLATFORM", remember: input.remember, meta });
  await setSessionCookie(SESSION_COOKIE.PLATFORM, token, expiresAt);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await auditPlatform(
    { actor: { userId: user.id, name: user.name, role: "Super Admin" }, meta },
    { action: "admin.login", entity: "User", entityId: user.id, summary: `${user.name} signed in to the platform console` },
  );
  return { redirectTo: safeNext(input.next, "/super-admin/dashboard", "/super-admin") };
}

export async function adminLogoutAction() {
  const store = await cookies();
  await revokeSession(store.get(SESSION_COOKIE.PLATFORM)?.value);
  store.delete(SESSION_COOKIE.PLATFORM);
  redirect("/super-admin/login");
}

export const updateAdminProfileAction = platformAction({ schema: profileSchema }, async (input, ctx) => {
  await prisma.user.update({ where: { id: ctx.user.id }, data: { name: input.name, phone: input.phone } });
  return { ok: true };
});

export const changeAdminPasswordAction = platformAction({ schema: changePasswordSchema }, async (input, ctx) => {
  await changePassword(ctx.user.id, input.currentPassword, input.newPassword, SESSION_COOKIE.PLATFORM);
  return { ok: true };
});

export async function getPlatformUser() {
  return getPlatformContext();
}

