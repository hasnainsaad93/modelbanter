import { Prisma } from "@prisma/client";
import { db } from "../server/db";
import { ANALYSIS_VERSION, categoryKeys, categories, MIN_CONFIDENCE, type StructuredAnalysis } from "../analysis";
import { randomUUID } from "node:crypto";
import { AnalysisConflict, analysisSnapshot, classificationDigest, json, lockAnalysis, withAnalysisTopics } from "./analysis-history";

type SaveOptions = { expectedRevision?: number; expectedBeforeHash?: string; operationKey?: string; source?: string };
export async function saveStructuredAnalysis(mentionId: string, result: StructuredAnalysis, options: SaveOptions = {}) {
  return db.$transaction(tx => saveAnalysisInTransaction(tx, mentionId, result, options));
}

export async function saveAnalysisInTransaction(tx: Prisma.TransactionClient, mentionId: string, result: StructuredAnalysis, options: SaveOptions = {}) {
  const current = await lockAnalysis(tx, mentionId);
  const operationKey = options.operationKey ?? randomUUID();
  const existing = await tx.analysisRevision.findUnique({ where: { operationKey } });
  if (existing) {
    if (existing.mentionId !== mentionId) throw new AnalysisConflict();
    return existing;
  }
  const before = analysisSnapshot(current);
  if ((options.expectedRevision !== undefined && options.expectedRevision !== current.analysisRevision) ||
    (options.expectedBeforeHash && options.expectedBeforeHash !== classificationDigest(before))) throw new AnalysisConflict();
  const accepted = result.relevance.choice === "YES" && result.relevance.confidence >= MIN_CONFIDENCE;
  await tx.modelMention.update({ where: { id: mentionId }, data: {
    analysisRevision: { increment: 1 },
    sentiment: result.overall.choice, sentimentScore: result.overall.probabilities.POSITIVE - result.overall.probabilities.NEGATIVE,
    confidence: result.overall.confidence, probabilities: result.overall.probabilities,
    relevance: result.relevance as unknown as Prisma.InputJsonValue,
    analysisContext: result.context ? { input: result.context, lookup: result.contextLookup ?? null } as unknown as Prisma.InputJsonValue : Prisma.DbNull,
    analysisProvider: "typesafe", analysisVersion: `${ANALYSIS_VERSION}/${result.model}`,
    analysisStatus: accepted ? "COMPLETED" : result.relevance.choice === "NO" ? "REJECTED" : "UNCERTAIN",
    analysisError: null, explanation: "", strengths: [], weaknesses: [], analyzedAt: new Date(),
    inputTokens: { increment: result.usage.input_tokens }, outputTokens: { increment: result.usage.output_tokens },
  } });
  for (const key of categoryKeys) {
    const topic = await tx.topic.upsert({ where: { slug: key }, create: { slug: key, name: categories[key] }, update: { name: categories[key] } });
    const decision = result.categories[key];
    const data = { sentiment: decision.choice, sentimentScore: decision.probabilities.POSITIVE - decision.probabilities.NEGATIVE, confidence: decision.confidence, probabilities: decision.probabilities };
    await tx.mentionTopic.upsert({ where: { mentionId_topicId: { mentionId, topicId: topic.id } }, create: { mentionId, topicId: topic.id, ...data }, update: data });
  }
  await tx.mentionTopic.deleteMany({ where: { mentionId, topic: { slug: { notIn: categoryKeys } } } });
  const after = await tx.modelMention.findUniqueOrThrow({ where: { id: mentionId }, include: withAnalysisTopics });
  return tx.analysisRevision.create({ data: { mentionId, revision: after.analysisRevision, operationKey, source: options.source ?? "INGESTION", before: json(before), after: json(analysisSnapshot(after)) } });
}

export async function recordAnalysisFailure(mentionId: string, error: unknown) {
  const { JevError } = await import("./jev");
  const message = error instanceof JevError ? error.message : "Analysis failed; retry is required.";
  await db.modelMention.updateMany({ where: { id: mentionId, analysisStatus: { notIn: ["COMPLETED", "REJECTED", "UNCERTAIN"] } }, data: { analysisStatus: "FAILED", analysisError: message } });
}
