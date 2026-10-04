import { randomUUID } from "node:crypto";
import { db } from "../server/db";
import { Prisma } from "@prisma/client";

export async function acquireJobLock(name: string, ttlMs = 55 * 60_000): Promise<string | null> {
  const ownerId = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);
  const updated = await db.jobLock.updateMany({ where: { name, expiresAt: { lte: now } }, data: { ownerId, expiresAt } });
  if (updated.count === 1) return ownerId;
  try { await db.jobLock.create({ data: { name, ownerId, expiresAt } }); return ownerId; }
  catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null; throw error; }
}
export async function releaseJobLock(name: string, ownerId: string) { await db.jobLock.deleteMany({ where: { name, ownerId } }); }
