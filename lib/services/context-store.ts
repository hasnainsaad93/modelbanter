import { randomUUID } from "node:crypto";
import { db } from "../server/db";
import { XApiError, lookupContextPost } from "./x-client";
import { postText, type ContextResolution, type ContextStore } from "./post-context";

const MINUTE = 60_000;
export function contextDailyLimit() {
  const limit = Number(process.env.X_CONTEXT_MAX_POSTS_PER_DAY ?? 20);
  if (!Number.isInteger(limit) || limit < 0 || limit > 200) throw new Error("X_CONTEXT_MAX_POSTS_PER_DAY must be an integer from 0 to 200.");
  return limit;
}

export class PrismaContextStore implements ContextStore {
  async read(id: string): Promise<ContextResolution> {
    const stored = await db.xPost.findUnique({ where: { xPostId: id }, select: { text: true, authorXId: true, rawPayload: true } });
    if (stored) return { status: "stored", post: { text: postText(stored.text, stored.rawPayload), authorXId: stored.authorXId } };
    const cached = await db.xPostContext.findUnique({ where: { xPostId: id } });
    if (!cached || cached.expiresAt <= new Date()) return { status: "not_loaded" };
    if (cached.status === "AVAILABLE" && cached.text) return { status: "cached", post: { text: cached.text, authorXId: cached.authorXId ?? undefined } };
    return { status: cached.status === "FETCHING" ? "in_flight" : cached.status === "UNAVAILABLE" ? "unavailable" : "lookup_failed" };
  }

  async fetch(id: string): Promise<ContextResolution> {
    if (!/^\d{1,25}$/.test(id)) return { status: "unavailable" };
    const cached = await this.read(id);
    if (cached.status !== "not_loaded") return cached;
    const limit = contextDailyLimit();
    if (!limit || !process.env.X_BEARER_TOKEN) return { status: "disabled" };
    const claimToken = randomUUID();
    const claim = await db.$transaction(async tx => {
      // Serialize only the short reservation transaction, never the network call.
      // This guards both the per-ID claim and the shared daily budget across workers.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('jev-context-reservation')::bigint)::text`;
      const now = new Date();
      const day = now.toISOString().slice(0, 10);
      const existing = await tx.xPostContext.findUnique({ where: { xPostId: id } });
      if (existing && existing.expiresAt > now) return "already_claimed";
      const budget = await tx.xContextBudget.upsert({ where: { day }, create: { day }, update: {} });
      if (budget.reserved >= limit || (budget.blockedUntil && budget.blockedUntil > now)) return "budget_exhausted";
      await tx.xContextBudget.update({ where: { day }, data: { reserved: { increment: 1 } } });
      const data = { status: "FETCHING", claimToken, text: null, authorXId: null, expiresAt: new Date(+now + MINUTE), fetchedAt: now };
      await tx.xPostContext.upsert({ where: { xPostId: id }, create: { xPostId: id, ...data }, update: data });
      return day;
    });
    if (claim === "already_claimed") return this.read(id);
    if (claim === "budget_exhausted") return { status: "budget_exhausted" };

    // One request per reserved resource. No retries, expansions, or recursive lookup.
    // Reservations are deliberately not refunded after errors or process crashes.
    try {
      const post = await lookupContextPost(id);
      await db.xPostContext.updateMany({ where: { xPostId: id, claimToken }, data: {
        status: "AVAILABLE", text: post.text, authorXId: post.authorXId, claimToken: null,
        fetchedAt: new Date(), expiresAt: new Date(Date.now() + 7 * 86400000),
      } });
      return { status: "fetched", post };
    } catch (error) {
      const unavailable = error instanceof XApiError && [403, 404, 410].includes(error.status);
      if (error instanceof XApiError && [401, 402, 403, 429].includes(error.status)) {
        await db.xContextBudget.update({ where: { day: claim }, data: { blockedUntil: new Date(`${claim}T23:59:59.999Z`) } });
      }
      await db.xPostContext.updateMany({ where: { xPostId: id, claimToken }, data: {
        status: unavailable ? "UNAVAILABLE" : "FAILED", claimToken: null,
        expiresAt: new Date(Date.now() + (unavailable ? 86400000 : 15 * MINUTE)),
      } });
      return { status: unavailable ? "unavailable" : "lookup_failed" };
    }
  }
}
