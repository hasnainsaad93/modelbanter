import { z } from "zod";
import { apiError, apiOk } from "@/lib/api";
import { db } from "@/lib/server/db";
import { isCronAuthorized } from "@/lib/server/cron-auth";
import { buildJevRequest, JevError } from "@/lib/services/jev";

import { analyzePostWithJev } from "@/lib/services/jev-context";
import { postText } from "@/lib/services/post-context";

export const runtime = "nodejs";
export const maxDuration = 180;

const inputSchema = z.object({
  // IDs must stay strings: X's numeric IDs exceed JavaScript's safe integer range.
  postId: z.string().trim().min(1).max(128),
  fetchContext: z.boolean().default(false),
  modelSlug: z.string().trim().min(1).max(128).optional(),
}).strict();

function error(code: string, message: string, status: number) {
  const response = apiError(code, message, status);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) return error("UNAUTHORIZED", "A valid CRON_SECRET bearer token is required.", 401);

  let body: unknown;
  try { body = await request.json(); }
  catch { return error("INVALID_BODY", "Send a JSON body with postId as a string and optional modelSlug/fetchContext.", 400); }
  const input = inputSchema.safeParse(body);
  if (!input.success) return error("INVALID_BODY", "Send postId as a nonempty string and optional modelSlug/fetchContext; no other fields are accepted.", 400);

  let post;
  let target;
  try {
    const { postId, modelSlug } = input.data;
    post = await db.xPost.findUnique({
      where: /^\d+$/.test(postId) ? { xPostId: postId } : { id: postId },
      select: { id: true, xPostId: true, text: true, rawPayload: true, authorXId: true, mentions: { select: { model: { select: { id: true, name: true, slug: true, vendor: true, aliases: true } } } } },
    });
    if (!post) return error("POST_NOT_FOUND", "No stored XPost matches this postId.", 404);
    if (modelSlug) {
      target = await db.model.findUnique({ where: { slug: modelSlug }, select: { id: true, name: true, slug: true, vendor: true, aliases: true } });
      if (!target) return error("MODEL_NOT_FOUND", "No catalog model matches this modelSlug.", 404);
    } else {
      if (post.mentions.length !== 1) {
        const candidates = post.mentions.map(mention => mention.model.slug).join(", ");
        return error("MODEL_REQUIRED", candidates ? `This post has multiple model associations. Pass modelSlug: ${candidates}.` : "This post has no model association. Pass a catalog modelSlug.", 400);
      }
      target = post.mentions[0].model;
    }
  } catch {
    return error("DATA_UNAVAILABLE", "Could not read the stored post or target model.", 503);
  }

  try {
    const started = Date.now();
    const analysis = await analyzePostWithJev(post.text, target.name, target, post, { allowFetch: input.data.fetchContext });
    return apiOk({
      post: { id: post.id, xPostId: post.xPostId, text: post.text },
      targetModel: target,
      request: buildJevRequest(postText(post.text, post.rawPayload), target.name, target, undefined, analysis.context),
      analysis,
      durationMs: Date.now() - started,
      persisted: false,
      contextFetchAllowed: input.data.fetchContext,
      contextCacheMayBeUpdated: input.data.fetchContext,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    if (cause instanceof JevError) return error("JEV_FAILED", cause.message, cause.status === 429 ? 429 : 502);
    return error("JEV_FAILED", "Jev analysis could not complete.", 502);
  }
}
