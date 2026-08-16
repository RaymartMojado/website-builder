import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Prisma client.
 *
 * Prisma 7 requires an explicit driver adapter. Note the connection role is
 * privileged and therefore BYPASSES row-level security — the RLS enabled in
 * the auth-bridge migration protects PostgREST, not these queries. Tenant
 * access control lives in lib/auth/guards.ts.
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

// Next.js hot-reloads modules in development, which would otherwise open a new
// connection pool on every edit until Postgres refuses them.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
