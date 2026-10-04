import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { XPostResponse } from "./x-client";

const post = z.object({ id: z.string(), text: z.string(), created_at: z.string(), author_id: z.string() }).passthrough();
const schema = z.object({
  version: z.literal(1), cycleId: z.string(), query: z.string(), endTime: z.string().datetime(),
  target: z.number().int().positive(), maxPages: z.number().int().positive(), resultsPerPage: z.number().int().positive(),
  accepted: z.number().int().nonnegative(), pages: z.number().int().nonnegative(),
  nextToken: z.string().optional(),
  pending: z.object({ posts: z.array(post), users: z.array(z.object({ id: z.string(), name: z.string(), username: z.string() })) }).optional(),
});
export type CollectionCheckpoint = Omit<z.infer<typeof schema>, "pending"> & {
  pending?: { posts: XPostResponse[]; users: { id: string; name: string; username: string }[] };
};
export function readCheckpoint(value: unknown): CollectionCheckpoint | undefined {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data as CollectionCheckpoint : undefined;
}
export function freshCheckpoint(query: string, target: number, maxPages: number, resultsPerPage: number): CollectionCheckpoint {
  // Pin the search's upper boundary across pages and resumed runs.
  return { version: 1, cycleId: randomUUID(), query, endTime: new Date(Date.now() - 30000).toISOString(), target, maxPages, resultsPerPage, accepted: 0, pages: 0 };
}
export function checkpointMatches(checkpoint: CollectionCheckpoint, query: string, target: number, maxPages: number, resultsPerPage: number) {
  // Recent-search cursors cannot safely be kept beyond the recent-search window.
  return checkpoint.query === query && checkpoint.target === target && checkpoint.maxPages === maxPages && checkpoint.resultsPerPage === resultsPerPage && Date.now() - Date.parse(checkpoint.endTime) < 6 * 86400000;
}
export function selectCollectionBatch<T extends { id: string; displayOrder: number; lastCollectionAttemptAt: Date | null }>(models: T[], count: number): T[] {
  return [...models].sort((a, b) => (a.lastCollectionAttemptAt?.getTime() ?? 0) - (b.lastCollectionAttemptAt?.getTime() ?? 0) || a.displayOrder - b.displayOrder || a.id.localeCompare(b.id)).slice(0, count);
}
