import { z } from "zod";
import { apiError, apiOk } from "@/lib/api";
import { db } from "@/lib/server/db";
import { isCronAuthorized } from "@/lib/server/cron-auth";

export const runtime = "nodejs";
const schema = z.object({ postId: z.string().min(1).max(128), modelSlug: z.string().min(1).max(128).optional(),
  beforeRevision: z.coerce.number().int().min(1).optional(),
}).strict();
function error(code: string, message: string, status: number) {
  const response = apiError(code, message, status); response.headers.set("Cache-Control", "no-store"); return response;
}
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) return error("UNAUTHORIZED", "A valid CRON_SECRET bearer token is required.", 401);
  const input = schema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!input.success) return error("INVALID_QUERY", "Pass postId, optional modelSlug, and optional beforeRevision.", 400);
  try {
    const { postId, modelSlug, beforeRevision } = input.data;
    const mentions = await db.modelMention.findMany({ where: {
      post: /^\d+$/.test(postId) ? { xPostId: postId } : { id: postId }, ...(modelSlug ? { model: { slug: modelSlug } } : {}),
    }, take: 2, select: { id: true, analysisRevision: true, analysisVersion: true, model: { select: { name: true, slug: true } } } });
    if (!mentions.length) return error("NOT_FOUND", "No stored model mention matches this post and model.", 404);
    if (mentions.length > 1) return error("MODEL_REQUIRED", "Pass modelSlug to choose one model association.", 400);
    const mention = mentions[0];
    const revisions = await db.analysisRevision.findMany({ where: { mentionId: mention.id, ...(beforeRevision ? { revision: { lt: beforeRevision } } : {}) }, orderBy: { revision: "desc" }, take: 21 });
    const page = revisions.slice(0, 20);
    return apiOk({ mention, revisions: page, nextBeforeRevision: revisions.length > 20 ? page.at(-1)!.revision : null }, { headers: { "Cache-Control": "no-store" } });
  } catch { return error("DATA_UNAVAILABLE", "Classification history could not be read. Check database connectivity and migrations.", 503); }
}
