import type { SessionScope } from "@/generated/prisma/enums";
import { prisma } from "../db";
import { generateToken, hashToken } from "../crypto";

export const SESSION_COOKIE: Record<SessionScope, string> = {
  PLATFORM: "tabla_admin_session",
  RESTAURANT: "tabla_session",
};

const DAY = 24 * 60 * 60 * 1000;
const SLIDE_AFTER_MS = 60 * 60 * 1000;

export function sessionTtlMs(remember = true): number {
  const days = Number(process.env.SESSION_TTL_DAYS ?? 14);
  return remember ? days * DAY : DAY;
}

export interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

export async function createSession(opts: {
  userId: string;
  scope: SessionScope;
  restaurantId?: string | null;
  remember?: boolean;
  meta?: RequestMeta;
}) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + sessionTtlMs(opts.remember ?? true));
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId: opts.userId,
      scope: opts.scope,
      restaurantId: opts.restaurantId ?? null,
      expiresAt,
      ipAddress: opts.meta?.ip ?? null,
      userAgent: opts.meta?.userAgent?.slice(0, 255) ?? null,
    },
  });
  return { token, expiresAt };
}

/**
 * Look up a live session by raw token. Expired sessions are removed.
 * Sessions slide forward at most once an hour to limit write traffic.
 */
export async function findSession(token: string | undefined | null, scope: SessionScope) {
  if (!token || token.length < 20) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.scope !== scope) return null;

  const now = Date.now();
  if (session.expiresAt.getTime() <= now) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (session.user.status !== "ACTIVE") return null;

  if (now - session.lastSeenAt.getTime() > SLIDE_AFTER_MS) {
    const ttl = session.expiresAt.getTime() - session.createdAt.getTime() > 2 * DAY ? sessionTtlMs(true) : sessionTtlMs(false);
    await prisma.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date(), expiresAt: new Date(now + ttl) } })
      .catch(() => {});
  }
  return session;
}

export async function revokeSession(token: string | undefined | null) {
  if (!token) return;
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export async function revokeUserSessions(userId: string, opts: { restaurantId?: string; exceptTokenHash?: string } = {}) {
  await prisma.session.deleteMany({
    where: {
      userId,
      ...(opts.restaurantId ? { restaurantId: opts.restaurantId } : {}),
      ...(opts.exceptTokenHash ? { NOT: { tokenHash: opts.exceptTokenHash } } : {}),
    },
  });
}

export async function switchSessionRestaurant(token: string, restaurantId: string) {
  await prisma.session.update({ where: { tokenHash: hashToken(token) }, data: { restaurantId } });
}
