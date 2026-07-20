import { describe, expect, it } from "vitest";
import { ingestModel, type MentionStore, type SearchClient } from "../lib/services/ingestion";
import { LocalSentimentProvider } from "../lib/services/sentiment";
import { XApiError, type XPage, type XPostResponse } from "../lib/services/x-client";
import { modelRegistry } from "../lib/model-registry";

const model = modelRegistry[3];
function post(id: number): XPostResponse { return { id: String(id), author_id: "a", created_at: new Date().toISOString(), text: `Kimi K3 is fast and reliable post ${id}`, public_metrics: { like_count: 1, reply_count: 0, retweet_count: 0, quote_count: 0 } }; }
class MemoryStore implements MentionStore {
  posts = new Set<string>(); associations = new Set<string>();
  constructor(existing: string[] = []) { existing.forEach((id) => { this.posts.add(id); this.associations.add(`${id}:${model.id}`); }); }
  async hasPost(id: string) { return this.posts.has(id); }
  async hasAssociation(id: string, modelId: string) { return this.associations.has(`${id}:${modelId}`); }
  async save(item: XPostResponse, _user: { id: string; name: string; username: string } | undefined, savedModel: typeof model) { const newPost = !this.posts.has(item.id); const key = `${item.id}:${savedModel.id}`; const newAssociation = !this.associations.has(key); this.posts.add(item.id); this.associations.add(key); return { newPost, newAssociation }; }
}
class Pages implements SearchClient { calls = 0; constructor(private pages: XPage[], private failure?: Error) {} async search() { const page = this.pages[this.calls++]; if (!page && this.failure) throw this.failure; return page ?? { posts: [], users: new Map() }; } }

describe("unique-post ingestion", () => {
  it("continues when the first page contains 19 duplicates and only six new posts", async () => { const first = Array.from({ length: 25 }, (_, i) => post(i + 1)); const second = Array.from({ length: 20 }, (_, i) => post(i + 26)); const client = new Pages([{ posts: first, users: new Map(), nextToken: "page-2" }, { posts: second, users: new Map() }]); const store = new MemoryStore(Array.from({ length: 19 }, (_, i) => String(i + 1))); const result = await ingestModel(model, client, store, new LocalSentimentProvider(), { target: 25 }); expect(client.calls).toBe(2); expect(result.newAssociationsInserted).toBe(25); expect(result.existingAssociations).toBe(19); expect(result.targetReached).toBe(true); });
  it("enforces the maximum page count", async () => { const client = new Pages([{ posts: [post(1)], users: new Map(), nextToken: "2" }, { posts: [post(2)], users: new Map(), nextToken: "3" }]); const result = await ingestModel(model, client, new MemoryStore(), new LocalSentimentProvider(), { target: 25, maxPages: 2 }); expect(client.calls).toBe(2); expect(result.status).toBe("PARTIALLY_COMPLETED"); });
  it("preserves partial progress on a rate limit", async () => { const client = new Pages([{ posts: Array.from({ length: 6 }, (_, i) => post(i)), users: new Map(), nextToken: "2" }], new XApiError("limited", 429, "rate_limit")); const result = await ingestModel(model, client, new MemoryStore(), new LocalSentimentProvider(), { target: 25 }); expect(result.newAssociationsInserted).toBe(6); expect(result.status).toBe("RATE_LIMITED"); });
  it("deduplicates associations separately from global posts", async () => { const store = new MemoryStore(); store.posts.add("1"); const client = new Pages([{ posts: [post(1)], users: new Map() }]); const result = await ingestModel(model, client, store, new LocalSentimentProvider()); expect(result.newPostsInserted).toBe(0); expect(result.newAssociationsInserted).toBe(1); });
});
