import { z } from "zod";

const referenceSchema = z.object({ id: z.string().regex(/^\d{1,25}$/), type: z.enum(["replied_to", "quoted"]) });
export type ContextStatus = "stored" | "cached" | "fetched" | "not_loaded" | "unavailable" | "lookup_failed" | "in_flight" | "budget_exhausted" | "time_budget" | "disabled";
export type ContextReference = { id: string; relationship: "replied_to" | "quoted"; status: ContextStatus; text?: string; author_id?: string; possibly_truncated?: boolean };
export type AnalysisContext = { version: 1; root_author_id?: string; metadata_available: boolean; possibly_truncated: boolean; references: ContextReference[] };
export type ContextSource = { rawPayload?: unknown; authorXId?: string; deadline?: number };
export type ContextPost = { text: string; authorXId?: string };
export type ContextResolution = { status: ContextStatus; post?: ContextPost };
export const analysisContextSchema = z.object({
  version: z.literal(1), root_author_id: z.string().optional(), metadata_available: z.boolean(), possibly_truncated: z.boolean(),
  references: z.array(z.object({ id: z.string(), relationship: z.enum(["replied_to", "quoted"]),
    status: z.enum(["stored", "cached", "fetched", "not_loaded", "unavailable", "lookup_failed", "in_flight", "budget_exhausted", "time_budget", "disabled"]),
    text: z.string().optional(), author_id: z.string().optional(), possibly_truncated: z.boolean().optional(),
  })).max(2),
});
export interface ContextStore {
  read(id: string): Promise<ContextResolution>;
  fetch(id: string): Promise<ContextResolution>;
}

// Only one-hop IDs from X metadata are eligible. Never follow arbitrary text URLs.
export function contextForPost(text: string, source?: ContextSource): AnalysisContext {
  const raw = source?.rawPayload && typeof source.rawPayload === "object" ? source.rawPayload as Record<string, unknown> : undefined;
  const references = raw?.referenced_tweets ?? raw?.referenced_posts;
  const seen = new Set<string>();
  return {
    version: 1,
    ...(source?.authorXId ? { root_author_id: source.authorXId } : {}),
    metadata_available: !!raw,
    possibly_truncated: possiblyTruncated(text),
    references: (Array.isArray(references) ? references : []).flatMap(value => {
      const result = referenceSchema.safeParse(value);
      if (!result.success || seen.has(result.data.id)) return [];
      seen.add(result.data.id);
      return [{ id: result.data.id, relationship: result.data.type, status: "not_loaded" as const }];
    }).slice(0, 2),
  };
}

export function possiblyTruncated(text: string) { return /(?:…|\.{3})\s*(?:https?:\/\/\S+)?\s*$/.test(text); }

export async function resolveContext(context: AnalysisContext, store: ContextStore, fetchMissing = false): Promise<AnalysisContext> {
  const references: ContextReference[] = [];
  for (const reference of context.references) {
    if (reference.text) { references.push(reference); continue; }
    let result: ContextResolution;
    try {
      result = fetchMissing ? await store.fetch(reference.id) : await store.read(reference.id);
    } catch {
      // Missing migration, DB failure, or X failure must never fabricate context.
      result = { status: "lookup_failed" };
    }
    references.push({ id: reference.id, relationship: reference.relationship, status: result.status,
      ...(result.post ? { text: result.post.text, author_id: result.post.authorXId, possibly_truncated: possiblyTruncated(result.post.text) } : {}),
    });
  }
  return { ...context, references };
}

// Some API versions use note_tweet, others note_post. Prefer supplied full text.
export function postText(text: string, rawPayload?: unknown) {
  const raw = rawPayload && typeof rawPayload === "object" ? rawPayload as Record<string, unknown> : {};
  const full = z.object({ text: z.string().min(1) }).safeParse(raw.note_tweet ?? raw.note_post);
  return full.success ? full.data.text : text;
}
