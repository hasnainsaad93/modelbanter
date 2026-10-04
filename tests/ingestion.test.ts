import { afterEach, describe, expect, it, vi } from "vitest";
import { ingestModel, type MentionStore, type SearchClient } from "../lib/services/ingestion";
import { LocalSentimentProvider } from "../lib/services/sentiment";
import { XApiError, type XPage, type XPostResponse } from "../lib/services/x-client";
import { modelRegistry } from "../lib/model-registry";
import { freshCheckpoint, type CollectionCheckpoint } from "../lib/services/collection-checkpoint";

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

const model = modelRegistry.find(model => model.slug === "kimi-k3")!;
function post(id: number): XPostResponse { return { id: String(id), author_id: "a", created_at: new Date().toISOString(), text: `Kimi K3 is fast and reliable post ${id}`, public_metrics: { like_count: 1, reply_count: 0, retweet_count: 0, quote_count: 0 } }; }
class MemoryStore implements MentionStore {
  stage?: MentionStore["stage"];
  retryable?: MentionStore["retryable"];
  fail?: MentionStore["fail"];
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
  it("classifies depleted credits as a usage limit", async () => { const client = new Pages([], new XApiError("CreditsDepleted", 402, "usage_limit", { type: "https://api.x.com/2/problems/usage-capped" })); const result = await ingestModel(model, client, new MemoryStore(), new LocalSentimentProvider(), { target: 25 }); expect(result.pagesRequested).toBe(1); expect(result.status).toBe("USAGE_LIMIT_REACHED"); expect(result.errorMessage).toContain("CreditsDepleted"); expect(result.rateLimitStatus).toContain("usage_limit"); });
  it("deduplicates associations separately from global posts", async () => { const store = new MemoryStore(); store.posts.add("1"); const client = new Pages([{ posts: [post(1)], users: new Map() }]); const result = await ingestModel(model, client, store, new LocalSentimentProvider()); expect(result.newPostsInserted).toBe(0); expect(result.newAssociationsInserted).toBe(1); });
});

describe("recoverable analysis failures", () => {
  it("stores raw evidence before classification and records failure for retry", async () => {
    const order: string[] = [];
    const store: MentionStore = {
      hasPost: async () => false, hasAssociation: async () => false,
      stage: async () => { order.push("stored"); return true; },
      fail: async () => { order.push("failed"); },
      save: async () => { throw new Error("must not save a fabricated decision"); },
    };
    const sentiment = { analyze: async () => { order.push("analysis"); throw new Error("upstream unavailable"); } };
    const result = await ingestModel(model, new Pages([{ posts: [post(1)], users: new Map() }]), store, sentiment);
    expect(order).toEqual(["stored", "analysis", "failed"]);
    expect(result.newPostsInserted).toBe(1);
    expect(result.newAssociationsInserted).toBe(0);
    expect(result.status).toBe("FAILED");
  });
  it("stops before the next paid request when the run deadline has passed", async () => {
    const client = new Pages([{ posts: [post(1)], users: new Map() }]);
    const result = await ingestModel(model, client, new MemoryStore(), new LocalSentimentProvider(), { deadline: Date.now() - 1000 });
    expect(client.calls).toBe(0);
    expect(result.status).toBe("PARTIALLY_COMPLETED");
  });
});

describe("checkpointed collection", () => {
  it("excludes older evidence in a saved page after the publication floor is introduced", async () => {
    vi.stubEnv("COLLECTION_START_AT", "2026-10-01T00:00:00Z");
    const checkpoint = freshCheckpoint(model.searchQuery, 1, 20, 100);
    checkpoint.pages = 1;
    checkpoint.pending = { posts: [{ ...post(1), created_at: "2026-09-30T23:59:59Z" }, { ...post(2), created_at: "2026-10-01T00:00:00Z" }], users: [] };
    const store = new MemoryStore();
    const result = await ingestModel(model, new Pages([]), store, new LocalSentimentProvider(), { target: 1, checkpoint });
    expect(store.posts.has("1")).toBe(false);
    expect(store.posts.has("2")).toBe(true);
    expect(result.rejectedPosts).toBe(1);
    expect(result.stopReason).toBe("TARGET_REACHED");
  });
  it("resumes a partly analyzed page without fetching it again and counts toward the original target", async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const client = new Pages([{ posts: [post(1), post(2), post(3)], users: new Map(), nextToken: "page-2" }]);
    const store = new MemoryStore();
    let saved: CollectionCheckpoint | null = null;
    const saveCheckpoint = async (value: CollectionCheckpoint | null) => { saved = structuredClone(value); };
    const provider = new LocalSentimentProvider();
    const slowProvider = { analyze: async (text: string, name: string) => { const value = await provider.analyze(text, name); vi.setSystemTime(start + 20); return value; } };
    const first = await ingestModel(model, client, store, slowProvider, { target: 2, deadline: start + 10, saveCheckpoint });
    expect(first.status).toBe("PARTIALLY_COMPLETED");
    expect(first.newAssociationsInserted).toBe(1);
    expect(saved!.accepted).toBe(1);
    expect(saved!.pending!.posts.map(item => item.id)).toEqual(["2", "3"]);
    const second = await ingestModel(model, client, store, provider, { target: 2, checkpoint: saved!, saveCheckpoint });
    expect(client.calls).toBe(1);
    expect(second.newAssociationsInserted).toBe(1);
    expect(second.acceptedInCycle).toBe(2);
    expect(second.stopReason).toBe("TARGET_REACHED");
    expect(second.targetReached).toBe(true);
    expect(saved).toBeNull();
  });

  it("does not analyze a result again after an interrupted cursor save", async () => {
    const store = new MemoryStore(["1"]);
    const checkpoint = freshCheckpoint(model.searchQuery, 2, 20, 100);
    checkpoint.accepted = 1; // Recovered from committed cycle analyses by runIngestion.
    checkpoint.pages = 1;
    checkpoint.pending = { posts: [post(1), post(2)], users: [] };
    const provider = { analyze: vi.fn((text: string, name: string) => new LocalSentimentProvider().analyze(text, name)) };
    const client = new Pages([]);
    const result = await ingestModel(model, client, store, provider, { target: 2, checkpoint });
    expect(result.targetReached).toBe(true);
    expect(result.existingAssociations).toBe(1);
    expect(provider.analyze).toHaveBeenCalledTimes(1);
    expect(client.calls).toBe(0);
  });

  it("retains failed evidence in the page buffer and retries it during resume", async () => {
    const client = new Pages([{ posts: [post(1)], users: new Map() }]);
    const store = new MemoryStore();
    let failed = false;
    store.stage = async () => { store.posts.add("1"); store.associations.add(`1:${model.id}`); return false; };
    store.retryable = async () => failed;
    store.fail = async () => { failed = true; };
    store.save = async () => ({ newPost: false, newAssociation: true });
    let saved: CollectionCheckpoint | null = null;
    const saveCheckpoint = async (value: CollectionCheckpoint | null) => { saved = structuredClone(value); };
    await ingestModel(model, client, store, { analyze: async () => { throw new Error("upstream unavailable"); } }, { target: 1, saveCheckpoint });
    expect(saved!.pending!.posts[0].id).toBe("1");
    const result = await ingestModel(model, client, store, new LocalSentimentProvider(), { target: 1, checkpoint: saved!, saveCheckpoint });
    expect(result.analysesCompleted).toBe(1);
    expect(result.targetReached).toBe(true);
    expect(client.calls).toBe(1);
  });

  it("enforces the page cap across resumed runs, rather than granting 20 new pages each time", async () => {
    const checkpoint = freshCheckpoint(model.searchQuery, 100, 20, 100);
    checkpoint.pages = 19;
    checkpoint.nextToken = "page-20";
    const search = vi.fn(async () => ({ posts: [post(1)], users: new Map(), nextToken: "page-21" }));
    let saved: CollectionCheckpoint | null = checkpoint;
    const result = await ingestModel(model, { search }, new MemoryStore(), new LocalSentimentProvider(), { checkpoint, maxPages: 20, saveCheckpoint: async value => { saved = value; } });
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith(model.searchQuery, "page-20", 100, checkpoint.endTime);
    expect(result.targetReached).toBe(false);
    expect(result.status).toBe("PARTIALLY_COMPLETED");
    expect(result.stopReason).toBe("PAGE_CAP");
    expect(saved).toBeNull();
  });
  it("clears an expired API cursor without deleting stored evidence", async () => {
    const checkpoint = freshCheckpoint(model.searchQuery, 100, 20, 100);
    checkpoint.pages = 1;
    checkpoint.nextToken = "expired";
    const store = new MemoryStore(["1"]);
    let saved: CollectionCheckpoint | null = checkpoint;
    const result = await ingestModel(model, new Pages([], new XApiError("Invalid next_token", 400, "fatal")), store, new LocalSentimentProvider(), { checkpoint, saveCheckpoint: async value => { saved = value; } });
    expect(saved).toBeNull();
    expect(store.posts.has("1")).toBe(true);
    expect(result.errorMessage).toContain("next rotation starts a fresh search");
  });
});
