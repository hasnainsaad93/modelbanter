import { postText, type ContextPost } from "./post-context";
import { collectionStart, recentSearchStart } from "./collection-window";
export type XPostResponse = { id: string; text: string; created_at: string; author_id: string; lang?: string; conversation_id?: string; public_metrics?: { like_count: number; reply_count: number; retweet_count: number; quote_count: number; impression_count?: number } };
export type XPage = { posts: XPostResponse[]; users: Map<string, { id: string; name: string; username: string }>; nextToken?: string };

export type XErrorKind = "rate_limit" | "usage_limit" | "auth" | "transient" | "fatal";
type XErrorBody = { type?: string; title?: string; detail?: string; errors?: Array<{ code?: number | string; message?: string }> };

export class XApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public kind: XErrorKind,
    public details: { type?: string; resetAt?: string; limit?: string; remaining?: string; retryAfter?: string } = {},
  ) { super(message); this.name = "XApiError"; }

  get rateLimitSummary() {
    return JSON.stringify({ status: this.status, kind: this.kind, ...this.details });
  }
}

export class XRecentSearchClient {
  constructor(private token = process.env.X_BEARER_TOKEN) {}
  async search(query: string, nextToken?: string, maxResults = 100, endTime?: string): Promise<XPage> {
    if (!this.token) throw new XApiError("X_BEARER_TOKEN is not configured", 401, "auth");
    const params = new URLSearchParams({ query: `${query} lang:en -is:retweet`, max_results: String(Math.min(100, Math.max(10, maxResults))), "tweet.fields": "id,text,author_id,created_at,lang,conversation_id,public_metrics,referenced_tweets", expansions: "author_id", "user.fields": "id,name,username" });
    const start = collectionStart();
    if (start) params.set("start_time", recentSearchStart(start));
    if (nextToken) params.set("next_token", nextToken);
    if (endTime) params.set("end_time", endTime);
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch(`https://api.x.com/2/tweets/search/recent?${params}`, { headers: { Authorization: `Bearer ${this.token}` }, signal: AbortSignal.timeout(20000) });
      if (response.ok) {
        const body = await response.json() as { data?: XPostResponse[]; includes?: { users?: { id: string; name: string; username: string }[] }; meta?: { next_token?: string } };
        return { posts: body.data ?? [], users: new Map((body.includes?.users ?? []).map((user) => [user.id, user])), nextToken: body.meta?.next_token };
      }
      const body = await readErrorBody(response);
      const kind = classifyXError(response.status, body);
      const detail = body.detail ?? body.errors?.map((error) => error.message).filter(Boolean).join("; ") ?? body.title ?? "Request rejected";
      const diagnostic = {
        type: body.type,
        resetAt: unixHeaderToIso(response.headers.get("x-rate-limit-reset")),
        limit: response.headers.get("x-rate-limit-limit") ?? undefined,
        remaining: response.headers.get("x-rate-limit-remaining") ?? undefined,
        retryAfter: response.headers.get("retry-after") ?? undefined,
      };
      if (kind !== "transient" || attempt === 2) throw new XApiError(`X recent search failed: ${detail} (HTTP ${response.status})`, response.status, kind, diagnostic);
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
    throw new XApiError("X recent search failed", 500, "fatal");
  }
}

export function buildXQuery(searchQuery: string) { return `${searchQuery} lang:en -is:retweet`; }

export function classifyXError(status: number, body: XErrorBody): XErrorKind {
  const signal = [body.type, body.title, body.detail, ...(body.errors ?? []).flatMap((error) => [String(error.code ?? ""), error.message])].filter(Boolean).join(" ").toLowerCase();
  if (status === 402 || /usage.?cap|usage.?capped|credits?.?depleted|insufficient.?credit|spending.?limit/.test(signal)) return "usage_limit";
  if (status === 429 || /rate.?limit/.test(signal)) return "rate_limit";
  if (status === 401 || status === 403) return "auth";
  if (status >= 500) return "transient";
  return "fatal";
}

async function readErrorBody(response: Response): Promise<XErrorBody> {
  try { return await response.json() as XErrorBody; }
  catch { return { detail: response.statusText || "X returned a non-JSON error response" }; }
}

function unixHeaderToIso(value: string | null) {
  if (!value) return undefined;
  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? new Date(timestamp * 1000).toISOString() : undefined;
}

// Context lookup intentionally excludes user/media expansions and retries.
export async function lookupContextPost(id: string, token = process.env.X_BEARER_TOKEN): Promise<ContextPost> {
  if (!/^\d{1,25}$/.test(id)) throw new XApiError("Invalid context post ID", 400, "fatal");
  if (!token) throw new XApiError("X_BEARER_TOKEN is not configured", 401, "auth");
  const response = await fetch(`https://api.x.com/2/tweets/${id}?tweet.fields=id,text,author_id`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new XApiError(`X context lookup failed (HTTP ${response.status})`, response.status, classifyXError(response.status, {}));
  const body = await response.json() as { data?: { id?: string; text?: string; author_id?: string } };
  if (body.data?.id !== id || typeof body.data.text !== "string" || !body.data.text.trim()) throw new XApiError("X context post is unavailable", 404, "fatal");
  return { text: postText(body.data.text, body.data), authorXId: body.data.author_id };
}
