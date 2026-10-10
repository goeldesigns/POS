import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { __prisma?: ReturnType<typeof createPrismaClient> };

/**
 * Platform-level client. Only use directly for platform (Super Admin) data,
 * authentication, and cross-tenant jobs. Tenant code must use `tenantDb()`.
 */
export const prisma = globalForPrisma.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.__prisma = prisma;

export type Db = typeof prisma;
