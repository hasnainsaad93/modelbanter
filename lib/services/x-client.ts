export type XPostResponse = { id: string; text: string; created_at: string; author_id: string; lang?: string; conversation_id?: string; public_metrics?: { like_count: number; reply_count: number; retweet_count: number; quote_count: number; impression_count?: number } };
export type XPage = { posts: XPostResponse[]; users: Map<string, { id: string; name: string; username: string }>; nextToken?: string };

export class XApiError extends Error { constructor(message: string, public status: number, public kind: "rate_limit" | "usage_limit" | "auth" | "transient" | "fatal") { super(message); } }

export class XRecentSearchClient {
  constructor(private token = process.env.X_BEARER_TOKEN) {}
  async search(query: string, nextToken?: string, maxResults = 100): Promise<XPage> {
    if (!this.token) throw new XApiError("X_BEARER_TOKEN is not configured", 401, "auth");
    const params = new URLSearchParams({ query: `${query} lang:en -is:retweet`, max_results: String(Math.min(100, Math.max(10, maxResults))), "tweet.fields": "id,text,author_id,created_at,lang,conversation_id,public_metrics,referenced_tweets", expansions: "author_id", "user.fields": "id,name,username" });
    if (nextToken) params.set("next_token", nextToken);
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch(`https://api.x.com/2/tweets/search/recent?${params}`, { headers: { Authorization: `Bearer ${this.token}` } });
      if (response.ok) {
        const body = await response.json() as { data?: XPostResponse[]; includes?: { users?: { id: string; name: string; username: string }[] }; meta?: { next_token?: string } };
        return { posts: body.data ?? [], users: new Map((body.includes?.users ?? []).map((user) => [user.id, user])), nextToken: body.meta?.next_token };
      }
      const kind = response.status === 429 ? "rate_limit" : response.status === 403 ? "usage_limit" : response.status === 401 ? "auth" : response.status >= 500 ? "transient" : "fatal";
      if (kind !== "transient" || attempt === 2) throw new XApiError(`X recent search failed (${response.status})`, response.status, kind);
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
    throw new XApiError("X recent search failed", 500, "fatal");
  }
}

export function buildXQuery(searchQuery: string) { return `${searchQuery} lang:en -is:retweet`; }
