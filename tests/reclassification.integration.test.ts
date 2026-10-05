import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient, Prisma } from "@prisma/client";
import { sentiments, type Decision, type Opinion, type StructuredAnalysis } from "../lib/analysis";
import { JevError } from "../lib/services/jev";
import { analysisSnapshot, digest, json, withAnalysisTopics } from "../lib/services/analysis-history";

const testUrl = process.env.CONTEXT_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !/^\/codex_jev_phase[34]_test_[a-f0-9]+$/.test(url.pathname)) throw new Error("Reclassification tests require a disposable local database.");
  process.env.DATABASE_URL = testUrl;
}
const decision = (choice: Opinion): Decision => ({ choice, confidence: .95, probabilities: Object.fromEntries(sentiments.map(label => [label, +(label === choice)])) as Decision["probabilities"] });
const result = (): StructuredAnalysis => ({ model: "jev-1.13.0", usage: { input_tokens: 100, output_tokens: 10 }, overall: decision("POSITIVE"),
  relevance: { choice: "YES", confidence: 1, probabilities: { YES: 1, NO: 0, UNCLEAR: 0 } },
  categories: { code_quality: decision("POSITIVE"), cost: decision("CANNOT_DETERMINE"), reasoning: decision("NOT_DISCUSSED"), speed: decision("NOT_DISCUSSED") },
});

describe.skipIf(!testUrl)("staged reclassification and atomic history", () => {
  let db: PrismaClient;
  let workflow: typeof import("../lib/services/reclassification");
  let store: typeof import("../lib/services/analysis-store");
  const posts: string[] = [], batches: string[] = [];
  beforeAll(async () => {
    vi.stubEnv("TYPESAFE_MODEL", "jev-1.13.0");
    db = (await import("../lib/server/db")).db;
    workflow = await import("../lib/services/reclassification");
    store = await import("../lib/services/analysis-store");
  });
  afterEach(async () => {
    await db.xPost.deleteMany({ where: { id: { in: posts.splice(0) } } });
    await db.reanalysisBatch.deleteMany({ where: { id: { in: batches.splice(0) } } });
  });
  afterAll(async () => { vi.unstubAllEnvs(); if (db) await db.$disconnect(); });
  async function mention() {
    const model = await db.model.findFirstOrThrow();
    const post = await db.xPost.create({ data: { xPostId: `test-${randomUUID()}`, authorXId: "111", authorName: "Test", authorUsername: "test", text: `${model.name} writes excellent code`, publishedAt: new Date() } });
    posts.push(post.id);
    return db.modelMention.create({ data: { postId: post.id, modelId: model.id, sentiment: "NEGATIVE", sentimentScore: -1, confidence: .9,
      explanation: "Original classification", strengths: [], weaknesses: ["old"], analysisProvider: "typesafe", analysisVersion: "jev-sentiment-v2/jev-1.13.0", analysisStatus: "COMPLETED", inputTokens: 40, outputTokens: 4,
    } });
  }
  async function prepare(id: string) {
    const batch = await workflow.prepareBatch({ refresh: true, mentionIds: [id] }); batches.push(batch.id); return batch;
  }
  async function snapshot(id: string) { return analysisSnapshot(await db.modelMention.findUniqueOrThrow({ where: { id }, include: withAnalysisTopics })); }

  it("previews without writes and stages candidates without changing current labels", async () => {
    const current = await mention(); const before = await snapshot(current.id);
    const count = await db.reanalysisBatch.count();
    expect(await workflow.previewBatch({ refresh: true, mentionIds: [current.id] })).toMatchObject({ selected: 1, maxXLookups: 0, databaseWrites: false });
    expect(await db.reanalysisBatch.count()).toBe(count);
    const batch = await prepare(current.id); const analyze = vi.fn().mockResolvedValue(result());
    const report = await workflow.runBatch(batch.id, { analyze });
    expect(report.counts).toEqual({ ANALYZED: 1 }); expect(await snapshot(current.id)).toEqual(before);
    expect(analyze.mock.calls[0][4]).toEqual({ allowFetch: false });
    await workflow.runBatch(batch.id, { analyze }); expect(analyze).toHaveBeenCalledTimes(1);
  });
  it("atomically applies once, preserves both snapshots, and rolls back without refunding usage", async () => {
    const current = await mention(); const before = await snapshot(current.id); const batch = await prepare(current.id);
    await workflow.runBatch(batch.id, { analyze: vi.fn().mockResolvedValue(result()) });
    expect((await workflow.applyBatch(batch.id)).counts).toEqual({ APPLIED: 1 });
    expect(await snapshot(current.id)).toMatchObject({ sentiment: "POSITIVE", analysisRevision: 1, inputTokens: 140 });
    const history = await db.analysisRevision.findMany({ where: { mentionId: current.id } });
    expect(history).toHaveLength(1); expect(history[0].before).toEqual(before); expect(history[0].after).toEqual(await snapshot(current.id));
    await workflow.applyBatch(batch.id); expect(await db.analysisRevision.count({ where: { mentionId: current.id } })).toBe(1);
    expect((await workflow.applyBatch(batch.id, true)).counts).toEqual({ ROLLED_BACK: 1 });
    const restored = await snapshot(current.id);
    expect(restored).toEqual({ ...before, analysisRevision: 2, inputTokens: 140, outputTokens: 14 });
    await workflow.applyBatch(batch.id, true); expect(await db.analysisRevision.count({ where: { mentionId: current.id } })).toBe(2);
  });
  it("retains a usable classification after provider failure and requires bounded explicit retries", async () => {
    const current = await mention(); const before = await snapshot(current.id); const batch = await prepare(current.id);
    const analyze = vi.fn().mockRejectedValue(new JevError("TypeSafe is unavailable (HTTP 429).", 429));
    expect((await workflow.runBatch(batch.id, { analyze })).counts).toEqual({ FAILED: 1 });
    await store.recordAnalysisFailure(current.id, new JevError("Failed refresh"));
    expect(await snapshot(current.id)).toEqual(before);
    await workflow.runBatch(batch.id, { analyze }); expect(analyze).toHaveBeenCalledTimes(1);
    await workflow.runBatch(batch.id, { analyze, retryFailed: true }); expect(analyze).toHaveBeenCalledTimes(2);
    await workflow.runBatch(batch.id, { analyze, retryFailed: true }); expect(analyze).toHaveBeenCalledTimes(2);
  });
  it("rejects changed source text before applying and preserves the old result", async () => {
    const current = await mention(); const batch = await prepare(current.id);
    await workflow.runBatch(batch.id, { analyze: vi.fn().mockResolvedValue(result()) });
    await db.xPost.update({ where: { id: current.postId }, data: { text: "Source was edited" } });
    expect((await workflow.applyBatch(batch.id)).counts).toEqual({ CONFLICT: 1 });
    expect((await snapshot(current.id)).sentiment).toBe("NEGATIVE");
  });
  it("can apply only selected reviewed mentions and rejects IDs outside the batch", async () => {
    const first = await mention(), second = await mention();
    const batch = await workflow.prepareBatch({ refresh: true, mentionIds: [first.id, second.id] }); batches.push(batch.id);
    await workflow.runBatch(batch.id, { analyze: vi.fn().mockResolvedValue(result()) });
    await expect(workflow.applyBatch(batch.id, false, ["not-in-batch"])).rejects.toThrow("belong to this batch");
    expect((await workflow.applyBatch(batch.id, false, [first.id])).counts).toEqual({ APPLIED: 1, ANALYZED: 1 });
    expect((await snapshot(first.id)).sentiment).toBe("POSITIVE"); expect((await snapshot(second.id)).sentiment).toBe("NEGATIVE");
  });
  it("does not spend on stale candidates and refuses changed classifier/rules", async () => {
    const current = await mention(); const batch = await prepare(current.id); const analyze = vi.fn().mockResolvedValue(result());
    await db.modelMention.update({ where: { id: current.id }, data: { sentiment: "NEUTRAL" } });
    expect((await workflow.runBatch(batch.id, { analyze })).counts).toEqual({ CONFLICT: 1 }); expect(analyze).not.toHaveBeenCalled();
    await db.reanalysisBatch.update({ where: { id: batch.id }, data: { ruleFingerprint: "changed" } });
    await expect(workflow.runBatch(batch.id, { analyze })).rejects.toThrow("different rules");
    await expect(workflow.applyBatch(batch.id)).rejects.toThrow("different rules");
  });
  it("does not mistake historical category display names for changed classifications", async () => {
    const current = await mention();
    const topic = await db.topic.findUniqueOrThrow({ where: { slug: "code_quality" } });
    await db.mentionTopic.create({ data: { mentionId: current.id, topicId: topic.id, sentiment: "NEGATIVE", sentimentScore: -1, confidence: .9 } });
    const batch = await prepare(current.id);
    const historical = await snapshot(current.id); historical.topics[0].name = "An older display label";
    await db.reanalysisItem.update({ where: { id: batch.items[0].id }, data: { before: json(historical) } });
    const analyze = vi.fn().mockResolvedValue(result());
    expect((await workflow.runBatch(batch.id, { analyze })).counts).toEqual({ ANALYZED: 1 });
    expect((await workflow.applyBatch(batch.id)).counts).toEqual({ APPLIED: 1 });
    const after = await snapshot(current.id); after.topics[0].name = "Another historical display label";
    await db.analysisRevision.update({ where: { operationKey: batch.items[0].id }, data: { after: json(after) } });
    expect((await workflow.applyBatch(batch.id, true)).counts).toEqual({ ROLLED_BACK: 1 });
    expect((await snapshot(current.id)).sentiment).toBe("NEGATIVE");
  });
  it("prevents two concurrent batches from overwriting the same base revision", async () => {
    const current = await mention(); const first = await prepare(current.id), second = await prepare(current.id);
    const analyze = vi.fn().mockResolvedValue(result());
    await workflow.runBatch(first.id, { analyze }); await workflow.runBatch(second.id, { analyze });
    await Promise.all([workflow.applyBatch(first.id), workflow.applyBatch(second.id)]);
    const states = await db.reanalysisItem.findMany({ where: { mentionId: current.id }, select: { status: true } });
    expect(states.map(item => item.status).sort()).toEqual(["APPLIED", "CONFLICT"]);
    expect(await db.analysisRevision.count({ where: { mentionId: current.id } })).toBe(1);
  });
  it("refuses rollback over a newer classification", async () => {
    const current = await mention(); const batch = await prepare(current.id);
    await workflow.runBatch(batch.id, { analyze: vi.fn().mockResolvedValue(result()) }); await workflow.applyBatch(batch.id);
    await store.saveStructuredAnalysis(current.id, { ...result(), overall: decision("MIXED") });
    const report = await workflow.applyBatch(batch.id, true);
    expect(report.items[0].error).toContain("changed"); expect(report.counts).toEqual({ APPLIED: 1 });
    expect((await snapshot(current.id)).sentiment).toBe("MIXED");
  });
  it("rolls back label/topic writes when creating history fails", async () => {
    const current = await mention(); const before = await snapshot(current.id);
    await expect(db.$transaction(async tx => {
      const failing = new Proxy(tx, { get(target, key) {
        if (key === "analysisRevision") return { ...target.analysisRevision, create: async () => { throw new Error("History unavailable"); } };
        return Reflect.get(target, key);
      } }) as Prisma.TransactionClient;
      await store.saveAnalysisInTransaction(failing, current.id, result());
    })).rejects.toThrow("History unavailable");
    expect(digest(await snapshot(current.id))).toBe(digest(before));
    expect(await db.analysisRevision.count({ where: { mentionId: current.id } })).toBe(0);
  });
  it("marks interrupted attempts for explicit recovery instead of silently repeating paid requests", async () => {
    const current = await mention(); const batch = await prepare(current.id);
    await db.reanalysisItem.update({ where: { id: batch.items[0].id }, data: { status: "RUNNING", attempts: 1, attemptId: "old-worker" } });
    const analyze = vi.fn().mockResolvedValue(result());
    const report = await workflow.runBatch(batch.id, { analyze });
    expect(report.counts).toEqual({ FAILED: 1 }); expect(analyze).not.toHaveBeenCalled();
    expect((await workflow.runBatch(batch.id, { analyze, retryFailed: true })).counts).toEqual({ ANALYZED: 1 });
    expect(analyze).toHaveBeenCalledTimes(1);
  });
});
