import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { PrismaContextStore } from "../lib/services/context-store";

// Opt-in only, and refuse any DB except the disposable local verification clone.
const testUrl = process.env.CONTEXT_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !/^\/codex_jev_phase[34]_test_[a-f0-9]+$/.test(url.pathname)) throw new Error("Context integration tests require a disposable local test database.");
  process.env.DATABASE_URL = testUrl;
}

describe.skipIf(!testUrl)("Postgres context cache and shared budget", () => {
  let db: PrismaClient;
  let store: PrismaContextStore;
  beforeAll(async () => {
    db = (await import("../lib/server/db")).db;
    const { PrismaContextStore } = await import("../lib/services/context-store");
    store = new PrismaContextStore();
  });
  beforeEach(async () => {
    await db.xPostContext.deleteMany(); await db.xContextBudget.deleteMany();
    vi.stubEnv("X_BEARER_TOKEN", "test-token"); vi.stubEnv("X_CONTEXT_MAX_POSTS_PER_DAY", "3");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json({ data: { id: new URL(url).pathname.split("/").at(-1), text: "Model A writes excellent code", author_id: "987" } })));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  afterAll(async () => { if (db) await db.$disconnect(); });

  it("enforces a shared cap under concurrent distinct requests and never changes collected-post counts", async () => {
    const where = { xPostId: { in: Array.from({ length: 10 }, (_, i) => String(81000 + i)) } };
    const before = await db.xPost.count({ where });
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => store.fetch(String(81000 + i))));
    expect(results.filter(result => result.status === "fetched")).toHaveLength(3);
    expect(results.filter(result => result.status === "budget_exhausted")).toHaveLength(7);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect((await db.xContextBudget.findMany())[0].reserved).toBe(3);
    expect(await db.xPost.count({ where })).toBe(before);
  });
  it("claims a shared parent once across concurrent workers and reuses its cached content", async () => {
    await Promise.all(Array.from({ length: 8 }, () => store.fetch("82000")));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await db.xContextBudget.findMany())[0].reserved).toBe(1);
    expect(await store.fetch("82000")).toMatchObject({ status: "cached", post: { authorXId: "987" } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("uses an existing collected post without spending or creating cache rows", async () => {
    const existing = await db.xPost.findFirstOrThrow();
    expect(await store.fetch(existing.xPostId)).toMatchObject({ status: "stored" });
    expect(fetch).not.toHaveBeenCalled(); expect(await db.xContextBudget.count()).toBe(0);
  });
  it("stops paid lookups for the UTC day after depleted credit or rate limiting", async () => {
    for (const status of [401, 402, 429]) {
      await db.xPostContext.deleteMany(); await db.xContextBudget.deleteMany();
      vi.mocked(fetch).mockClear().mockResolvedValue(new Response("", { status }));
      expect((await store.fetch("83000")).status).toBe("lookup_failed");
      expect((await store.fetch("83001")).status).toBe("budget_exhausted");
      expect(fetch).toHaveBeenCalledTimes(1);
      expect((await db.xContextBudget.findMany())[0].reserved).toBe(1);
    }
  });
  it("negative-caches missing posts and counts failed attempts against the budget", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 404 }));
    expect((await store.fetch("84000")).status).toBe("unavailable");
    expect((await store.fetch("84000")).status).toBe("unavailable");
    expect(fetch).toHaveBeenCalledTimes(1); expect((await db.xContextBudget.findMany())[0].reserved).toBe(1);
  });
  it("disables network access at zero and fails closed on invalid configuration", async () => {
    vi.stubEnv("X_CONTEXT_MAX_POSTS_PER_DAY", "0");
    expect((await store.fetch("85000")).status).toBe("disabled");
    vi.stubEnv("X_CONTEXT_MAX_POSTS_PER_DAY", "typo");
    await expect(store.fetch("85000")).rejects.toThrow("must be an integer");
    expect(fetch).not.toHaveBeenCalled(); expect(await db.xContextBudget.count()).toBe(0);
  });
  it("can reacquire an expired claim, without refunding its earlier reservation", async () => {
    const day = new Date().toISOString().slice(0, 10);
    await db.xContextBudget.create({ data: { day, reserved: 1 } });
    await db.xPostContext.create({ data: { xPostId: "86000", status: "FETCHING", claimToken: "abandoned", expiresAt: new Date(0) } });
    expect((await store.fetch("86000")).status).toBe("fetched");
    expect((await db.xContextBudget.findUniqueOrThrow({ where: { day } })).reserved).toBe(2);
  });
  it("round-trips uncertainty, clear categories, provenance and version through the analysis store", async () => {
    const { saveStructuredAnalysis } = await import("../lib/services/analysis-store");
    const model = await db.model.findFirstOrThrow();
    const post = await db.xPost.create({ data: { xPostId: "87000", authorXId: "111", authorUsername: "test", authorName: "Test", text: "Test only", publishedAt: new Date() } });
    try {
      const mention = await db.modelMention.create({ data: { postId: post.id, modelId: model.id, sentiment: "NEUTRAL", sentimentScore: 0, confidence: 0, explanation: "", strengths: [], weaknesses: [], analysisProvider: "pending", analysisVersion: "pending" } });
      const { sentiments } = await import("../lib/analysis");
      const decision = (choice: "CANNOT_DETERMINE" | "POSITIVE" | "NOT_DISCUSSED") => ({ choice, confidence: .95,
        probabilities: Object.fromEntries(sentiments.map(label => [label, +(label === choice)])) as import("../lib/analysis").Decision["probabilities"],
      });
      await saveStructuredAnalysis(mention.id, { model: "jev-test", usage: { input_tokens: 200, output_tokens: 20 },
        overall: decision("CANNOT_DETERMINE"), relevance: { choice: "YES", confidence: 1, probabilities: { YES: 1, NO: 0, UNCLEAR: 0 } },
        context: { version: 1, metadata_available: true, possibly_truncated: true, references: [] },
        categories: { code_quality: decision("POSITIVE"), reasoning: decision("NOT_DISCUSSED"), speed: decision("NOT_DISCUSSED"), cost: decision("CANNOT_DETERMINE") },
      });
      const saved = await db.modelMention.findUniqueOrThrow({ where: { id: mention.id }, include: { topics: { include: { topic: true } } } });
      expect(saved).toMatchObject({ sentiment: "CANNOT_DETERMINE", analysisStatus: "COMPLETED", analysisVersion: "jev-sentiment-v4/jev-test", inputTokens: 200, outputTokens: 20 });
      expect(saved.analysisContext).toMatchObject({ input: { possibly_truncated: true } });
      expect(saved.topics.find(topic => topic.topic.slug === "code_quality")?.sentiment).toBe("POSITIVE");
      expect(saved.topics.find(topic => topic.topic.slug === "cost")?.sentiment).toBe("CANNOT_DETERMINE");
    } finally { await db.xPost.delete({ where: { id: post.id } }); }
  });
});
