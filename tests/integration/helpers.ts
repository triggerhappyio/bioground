// Shared setup for integration tests that need a real Postgres connection.
// These tests are NOT allowed to run against SQLite or an in-memory
// substitute — the behavior under test (raw guarded SQL UPDATEs, row
// locking, transaction isolation) is Postgres-specific, and a fake would
// prove nothing about production correctness. If DATABASE_URL isn't set or
// the database isn't reachable, tests using this helper report SKIPPED,
// never a false PASS.
import { PrismaClient } from "@prisma/client";

export async function getTestPrisma(): Promise<PrismaClient | null> {
  if (!process.env.DATABASE_URL) return null;
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return prisma;
  } catch {
    await prisma.$disconnect();
    return null;
  }
}

export const dbAvailable = async () => (await getTestPrisma()) !== null;
