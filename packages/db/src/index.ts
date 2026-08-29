import { PrismaClient } from "@prisma/client";

// Single client per process; Next.js dev hot-reload would otherwise open a new
// connection pool on every recompile.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type { User, Session, Account, Verification, Booking, CrewProfileClaim } from "@prisma/client";
