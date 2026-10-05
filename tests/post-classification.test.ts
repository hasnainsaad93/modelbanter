import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPosts } from "../lib/analytics/data";
import { dashboardQuerySchema } from "../lib/analytics/query";

const mocks = vi.hoisted(() => ({ count: vi.fn(), findMany: vi.fn() }));
vi.mock("../lib/server/db", () => ({ db: { modelMention: mocks } }));

function record() {
  return {
    id: "mention", model: { name: "Model A", slug: "model-a" },
    sentiment: "POSITIVE", confidence: .9, probabilities: { POSITIVE: .9, NEGATIVE: .1 },
    relevance: { choice: "YES", confidence: .98, privateField: "do not expose" },
    analysisVersion: "jev-sentiment-v4/jev-1.13.0", analyzedAt: new Date("2026-10-05T12:00:00Z"),
    topics: [{ topic: { slug: "speed", name: "Speed" }, sentiment: "NEGATIVE", confidence: .8, probabilities: { POSITIVE: .15, NEGATIVE: .8, NEUTRAL: .05 } }],
    post: { xPostId: "2106864289352937900", text: "Great model, slow replies.", authorName: "User", authorUsername: "user", publishedAt: new Date("2026-10-04T12:00:00Z"), likeCount: 0, replyCount: 0, repostCount: 0 },
  };
}

beforeEach(() => { vi.resetAllMocks(); mocks.count.mockResolvedValue(1); mocks.findMany.mockResolvedValue([record()]); });

describe("public saved post classifications", () => {
  it("uses the selected category's saved confidence and probabilities while preserving the independent overall decision", async () => {
    const { items } = await getPosts(dashboardQuerySchema.parse({ model: "model-a", category: "speed" }));
    expect(items[0]).toMatchObject({ sentiment: "NEGATIVE", confidence: .8, classification: { focus: "Speed", probabilities: [{ sentiment: "POSITIVE", probability: .15 }, { sentiment: "NEGATIVE", probability: .8 }, { sentiment: "NEUTRAL", probability: .05 }], relevance: { choice: "YES", confidence: .98 } } });
    expect(items[0].classification.decisions).toContainEqual({ category: "all", name: "Overall", sentiment: "POSITIVE", confidence: .9 });
    expect(JSON.stringify(items[0])).not.toContain("privateField");
    expect(mocks.findMany.mock.calls[0][0].select).toMatchObject({ confidence: true, probabilities: true, relevance: true, topics: { select: { confidence: true, probabilities: true } } });
  });
  it("keeps missing classifications and probabilities unavailable rather than inventing neutral results", async () => {
    mocks.findMany.mockResolvedValue([{ ...record(), probabilities: null, relevance: null, topics: [] }]);
    const { items } = await getPosts(dashboardQuerySchema.parse({ model: "model-a" }));
    expect(items[0].classification).toMatchObject({ probabilities: [], relevance: null });
    expect(items[0].classification.decisions.find(decision => decision.category === "speed")).toEqual({ category: "speed", name: "Speed", sentiment: null, confidence: null });
  });
  it("omits malformed probabilities and unknown stored JSON fields from the public response", async () => {
    mocks.findMany.mockResolvedValue([{ ...record(), probabilities: { POSITIVE: .9, NEGATIVE: -1, NEUTRAL: "0.2", MIXED: 2, internal: "private" }, relevance: { choice: "YES", confidence: 4 } }]);
    const { items } = await getPosts(dashboardQuerySchema.parse({ model: "model-a" }));
    expect(items[0].classification).toMatchObject({ probabilities: [{ sentiment: "POSITIVE", probability: .9 }], relevance: null });
  });
});
