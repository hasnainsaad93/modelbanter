import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { ANALYSIS_VERSION } from "../analysis";
import { db } from "../server/db";
import { AnalysisConflict, analysisSnapshot, classificationDigest, digest, json, restoreAnalysis, withAnalysisTopics } from "./analysis-history";
import { saveAnalysisInTransaction } from "./analysis-store";
import { analyzePostWithJev } from "./jev-context";
import { JevError, structuredAnalysisSchema } from "./jev";
import { buildJevQuestions, DEFAULT_JEV_MODEL } from "./jev-prompts";
import { acquireJobLock, releaseJobLock } from "./job-lock";

export const batchSelectionSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20), refresh: z.boolean().default(false),
  model: z.string().min(1).optional(), since: z.iso.datetime().optional(), mentionIds: z.array(z.string().min(1)).min(1).max(100).optional(),
  fetchContext: z.boolean().default(false),
});
export type BatchSelection = z.infer<typeof batchSelectionSchema>;
const inputSchema = z.object({
  text: z.string(), xPostId: z.string(), authorXId: z.string(), rawPayload: z.json().nullable(),
  target: z.object({ id: z.string(), name: z.string(), slug: z.string(), vendor: z.string(), aliases: z.array(z.string()) }),
});
export type ReclassificationInput = z.infer<typeof inputSchema>;
function analysisInput(post: { text: string; xPostId: string; authorXId: string; rawPayload: Prisma.JsonValue }, model: ReclassificationInput["target"]): ReclassificationInput {
  return inputSchema.parse({ text: post.text, xPostId: post.xPostId, authorXId: post.authorXId, rawPayload: post.rawPayload, target: model });
}
export function classifierConfig() {
  const classifier = process.env.TYPESAFE_MODEL || DEFAULT_JEV_MODEL;
  if (!/^jev-\d+\.\d+\.\d+$/.test(classifier)) throw new Error("Reclassification requires a pinned Jev version.");
  return { classifier, targetVersion: `${ANALYSIS_VERSION}/${classifier}`, ruleFingerprint: digest(buildJevQuestions("__target__")) };
}
function verifyBatch(batch: { classifier: string; targetVersion: string; ruleFingerprint: string }) {
  const current = classifierConfig();
  if (current.classifier !== batch.classifier || current.targetVersion !== batch.targetVersion || current.ruleFingerprint !== batch.ruleFingerprint) {
    throw new Error("This batch was prepared with different rules or a different classifier. Prepare a new batch.");
  }
}
function selectionWhere(selection: BatchSelection): Prisma.ModelMentionWhereInput {
  return { post: { isDemo: false, ...(selection.since ? { publishedAt: { gte: new Date(selection.since) } } : {}) },
    ...(selection.model ? { model: { slug: selection.model } } : {}),
    ...(selection.mentionIds ? { id: { in: selection.mentionIds } } : {}),
    ...(selection.refresh ? { NOT: { analysisVersion: classifierConfig().targetVersion } } : { analysisStatus: { in: ["PENDING", "FAILED", "LEGACY"] } }),
  };
}
export async function previewBatch(raw: z.input<typeof batchSelectionSchema> = {}) {
  const selection = batchSelectionSchema.parse(raw);
  const where = selectionWhere(selection);
  const [eligible, mentions] = await Promise.all([
    db.modelMention.count({ where }),
    db.modelMention.findMany({ where, orderBy: { id: "asc" }, take: selection.limit, select: { id: true, analysisVersion: true, model: { select: { name: true } }, post: { select: { xPostId: true } } } }),
  ]);
  return { selection, ...classifierConfig(), eligible, selected: mentions.length, mentions, paidCalls: false, databaseWrites: false,
    maxSuccessfulJevAnalyses: mentions.length * (selection.fetchContext ? 2 : 1), maxXLookups: selection.fetchContext ? mentions.length * 2 : 0 };
}
export async function prepareBatch(raw: z.input<typeof batchSelectionSchema> = {}) {
  const selection = batchSelectionSchema.parse(raw);
  const config = classifierConfig();
  return db.$transaction(async tx => {
    const mentions = await tx.modelMention.findMany({ where: selectionWhere(selection), orderBy: { id: "asc" }, take: selection.limit,
      include: { ...withAnalysisTopics, post: true, model: true },
    });
    if (!mentions.length) throw new Error("No eligible mentions match this selection.");
    return tx.reanalysisBatch.create({ data: { ...config, fetchContext: selection.fetchContext, filters: json(selection), items: { create: mentions.map(mention => {
      const input = analysisInput(mention.post, mention.model);
      return { mentionId: mention.id, baseRevision: mention.analysisRevision, input: json(input), inputHash: digest(input), before: json(analysisSnapshot(mention)) };
    }) } }, include: { items: true } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function getBatchReport(id: string) {
  const batch = await db.reanalysisBatch.findUniqueOrThrow({ where: { id }, include: { items: { orderBy: { id: "asc" } } } });
  const counts: Record<string, number> = {};
  let inputTokens = 0, outputTokens = 0;
  for (const item of batch.items) {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
    if (item.candidate) { const result = structuredAnalysisSchema.parse(item.candidate); inputTokens += result.usage.input_tokens; outputTokens += result.usage.output_tokens; }
  }
  return { ...batch, counts, recordedCandidateUsage: { inputTokens, outputTokens }, attempts: batch.items.reduce((sum, item) => sum + item.attempts, 0) };
}

export async function runBatch(id: string, options: { retryFailed?: boolean; analyze?: typeof analyzePostWithJev; onProgress?: (event: object) => void } = {}) {
  const batch = await db.reanalysisBatch.findUniqueOrThrow({ where: { id } }); verifyBatch(batch);
  const owner = await acquireJobLock(`reanalysis:${id}`, 10 * 60_000);
  if (!owner) throw new Error("This batch is already being processed.");
  const deadline = Date.now() + 4 * 60_000;
  try {
    // An interrupted paid request has an unknown outcome; never silently retry it.
    await db.reanalysisItem.updateMany({ where: { batchId: id, status: "RUNNING" }, data: { status: "FAILED", attemptId: null, error: "Interrupted attempt; review before explicitly retrying." } });
    if (options.retryFailed) await db.reanalysisItem.updateMany({ where: { batchId: id, status: "FAILED", attempts: { lt: 2 } }, data: { status: "PENDING", error: null } });
    const items = await db.reanalysisItem.findMany({ where: { batchId: id, status: "PENDING", attempts: { lt: 2 } }, orderBy: { id: "asc" } });
    for (const item of items) {
      if (Date.now() >= deadline) break;
      const input = inputSchema.parse(item.input);
      const current = await db.modelMention.findUniqueOrThrow({ where: { id: item.mentionId }, include: { ...withAnalysisTopics, post: true, model: true } });
      if (current.analysisRevision !== item.baseRevision || classificationDigest(analysisSnapshot(current)) !== classificationDigest(item.before) || digest(analysisInput(current.post, current.model)) !== item.inputHash) {
        await db.reanalysisItem.update({ where: { id: item.id }, data: { status: "CONFLICT", error: new AnalysisConflict().message } }); continue;
      }
      const attemptId = randomUUID();
      await db.reanalysisItem.update({ where: { id: item.id }, data: { status: "RUNNING", attempts: { increment: 1 }, attemptId, error: null } });
      try {
        const result = structuredAnalysisSchema.parse(await (options.analyze ?? analyzePostWithJev)(input.text, input.target.name, input.target,
          { rawPayload: input.rawPayload, authorXId: input.authorXId, deadline }, { allowFetch: batch.fetchContext }));
        if (result.model !== batch.classifier) throw new Error("The provider returned a different classifier version.");
        await db.reanalysisItem.updateMany({ where: { id: item.id, attemptId, status: "RUNNING" }, data: { status: "ANALYZED", candidate: json(result), attemptId: null } });
        options.onProgress?.({ event: "reanalysis.candidate", batchId: id, itemId: item.id, model: input.target.name });
      } catch (error) {
        const message = error instanceof JevError ? error.message : "Candidate analysis failed; existing classification was retained.";
        await db.reanalysisItem.updateMany({ where: { id: item.id, attemptId, status: "RUNNING" }, data: { status: "FAILED", error: message, attemptId: null } });
        options.onProgress?.({ event: "reanalysis.failed", batchId: id, itemId: item.id, message });
        // Stop on the first failure, including network/provider errors. Resuming is explicit.
        break;
      }
    }
    return getBatchReport(id);
  } finally { await releaseJobLock(`reanalysis:${id}`, owner); }
}

export async function applyBatch(id: string, rollback = false, onlyMentionIds?: string[]) {
  const batch = await db.reanalysisBatch.findUniqueOrThrow({ where: { id } });
  if (!rollback) verifyBatch(batch);
  if (onlyMentionIds) {
    z.array(z.string().min(1)).min(1).max(100).parse(onlyMentionIds);
    const count = await db.reanalysisItem.count({ where: { batchId: id, mentionId: { in: onlyMentionIds } } });
    if (count !== new Set(onlyMentionIds).size) throw new Error("Every selected mention must belong to this batch.");
  }
  const owner = await acquireJobLock(`reanalysis:${id}`, 10 * 60_000);
  if (!owner) throw new Error("This batch is already being processed.");
  try {
    const items = await db.reanalysisItem.findMany({ where: { batchId: id, ...(onlyMentionIds ? { mentionId: { in: onlyMentionIds } } : {}), status: rollback ? "APPLIED" : "ANALYZED" }, orderBy: { id: "asc" } });
    for (const item of items) {
      try {
        await db.$transaction(async tx => {
          await tx.$queryRaw`SELECT "id" FROM "ReanalysisItem" WHERE "id" = ${item.id} FOR UPDATE`;
          const fresh = await tx.reanalysisItem.findUniqueOrThrow({ where: { id: item.id } });
          if (fresh.status !== (rollback ? "APPLIED" : "ANALYZED")) return;
          if (rollback) await restoreAnalysis(tx, fresh.id);
          else {
            // Lock source rows too so a concurrent edit cannot invalidate checked input.
            await tx.$queryRaw`SELECT p."id" FROM "XPost" p JOIN "ModelMention" m ON m."postId" = p."id" WHERE m."id" = ${fresh.mentionId} FOR SHARE OF p`;
            await tx.$queryRaw`SELECT x."id" FROM "Model" x JOIN "ModelMention" m ON m."modelId" = x."id" WHERE m."id" = ${fresh.mentionId} FOR SHARE OF x`;
            const current = await tx.modelMention.findUniqueOrThrow({ where: { id: fresh.mentionId }, include: { post: true, model: true } });
            if (digest(analysisInput(current.post, current.model)) !== fresh.inputHash) throw new AnalysisConflict();
            const result = structuredAnalysisSchema.parse(fresh.candidate);
            if (result.model !== batch.classifier) throw new AnalysisConflict();
            await saveAnalysisInTransaction(tx, fresh.mentionId, result, { operationKey: fresh.id, source: "REANALYSIS", expectedRevision: fresh.baseRevision, expectedBeforeHash: classificationDigest(fresh.before) });
          }
          await tx.reanalysisItem.update({ where: { id: fresh.id }, data: { status: rollback ? "ROLLED_BACK" : "APPLIED", error: null } });
        }, { timeout: 15000 });
      } catch (error) {
        if (!(error instanceof AnalysisConflict)) throw error;
        // Keep an applied item's state when rollback conflicts with a newer revision.
        await db.reanalysisItem.update({ where: { id: item.id }, data: { ...(rollback ? {} : { status: "CONFLICT" }), error: error.message } });
      }
    }
    return getBatchReport(id);
  } finally { await releaseJobLock(`reanalysis:${id}`, owner); }
}
