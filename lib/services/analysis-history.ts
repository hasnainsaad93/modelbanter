import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { sentiments } from "../analysis";

export const withAnalysisTopics = { topics: { include: { topic: true } } } as const;
type StoredAnalysis = Prisma.ModelMentionGetPayload<{ include: typeof withAnalysisTopics }>;
export const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));

export function digest(value: unknown): string {
  const normalize = (item: unknown): unknown => Array.isArray(item) ? item.map(normalize) : item !== null && typeof item === "object"
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, normalize(entry)])) : item;
  return createHash("sha256").update(JSON.stringify(normalize(json(value)))).digest("hex");
}

export function analysisSnapshot(mention: StoredAnalysis) {
  return {
    sentiment: mention.sentiment, sentimentScore: mention.sentimentScore, confidence: mention.confidence,
    explanation: mention.explanation, strengths: mention.strengths, weaknesses: mention.weaknesses,
    analysisProvider: mention.analysisProvider, analysisVersion: mention.analysisVersion, analysisStatus: mention.analysisStatus,
    analysisError: mention.analysisError, probabilities: mention.probabilities, relevance: mention.relevance,
    analysisContext: mention.analysisContext, analyzedAt: mention.analyzedAt.toISOString(),
    inputTokens: mention.inputTokens, outputTokens: mention.outputTokens, analysisRevision: mention.analysisRevision,
    topics: mention.topics.map(topic => ({ topicId: topic.topicId, slug: topic.topic.slug, name: topic.topic.name,
      sentiment: topic.sentiment, sentimentScore: topic.sentimentScore, confidence: topic.confidence, probabilities: topic.probabilities,
    })).sort((a, b) => a.topicId.localeCompare(b.topicId)),
  };
}
export type AnalysisSnapshot = ReturnType<typeof analysisSnapshot>;

// Topic display names are shared catalog metadata, not a mention's classification.
// They remain in the audit snapshot but must not stale every item when renamed.
export function classificationDigest(snapshot: unknown) {
  const value = json(snapshot) as Record<string, unknown>;
  return digest({ ...value, topics: Array.isArray(value.topics) ? value.topics.map(topic =>
    Object.fromEntries(Object.entries(topic).filter(([key]) => key !== "name"))) : [] });
}

export class AnalysisConflict extends Error {
  constructor() { super("The source or saved classification changed since this batch was prepared. Prepare a fresh batch."); this.name = "AnalysisConflict"; }
}
export async function lockAnalysis(tx: Prisma.TransactionClient, mentionId: string) {
  await tx.$queryRaw`SELECT "id" FROM "ModelMention" WHERE "id" = ${mentionId} FOR UPDATE`;
  return tx.modelMention.findUniqueOrThrow({ where: { id: mentionId }, include: withAnalysisTopics });
}

const snapshotSchema = z.object({
  sentiment: z.enum(sentiments), sentimentScore: z.number(), confidence: z.number().min(0).max(1),
  explanation: z.string(), strengths: z.array(z.string()), weaknesses: z.array(z.string()),
  analysisProvider: z.string(), analysisVersion: z.string(), analysisStatus: z.string(), analysisError: z.string().nullable(),
  probabilities: z.json().nullable(), relevance: z.json().nullable(), analysisContext: z.json().nullable(),
  analyzedAt: z.iso.datetime(),
  topics: z.array(z.object({ topicId: z.string(), sentiment: z.enum(sentiments), sentimentScore: z.number(), confidence: z.number(), probabilities: z.json().nullable() })),
});

export async function restoreAnalysis(tx: Prisma.TransactionClient, operationKey: string) {
  const original = await tx.analysisRevision.findUniqueOrThrow({ where: { operationKey } });
  const current = await lockAnalysis(tx, original.mentionId);
  if (current.analysisRevision !== original.revision || classificationDigest(analysisSnapshot(current)) !== classificationDigest(original.after)) throw new AnalysisConflict();
  const snapshot = snapshotSchema.parse(original.before);
  const { topics, probabilities, relevance, analysisContext, ...values } = snapshot;
  await tx.modelMention.update({ where: { id: current.id }, data: { ...values, analyzedAt: new Date(values.analyzedAt),
    probabilities: probabilities ?? Prisma.DbNull, relevance: relevance ?? Prisma.DbNull, analysisContext: analysisContext ?? Prisma.DbNull,
    analysisRevision: { increment: 1 },
    // Restoring labels never refunds or resets cumulative API usage.
  } });
  await tx.mentionTopic.deleteMany({ where: { mentionId: current.id } });
  for (const topic of topics) await tx.mentionTopic.create({ data: { ...topic, mentionId: current.id, probabilities: topic.probabilities ?? Prisma.DbNull } });
  const restored = await tx.modelMention.findUniqueOrThrow({ where: { id: current.id }, include: withAnalysisTopics });
  return tx.analysisRevision.create({ data: { mentionId: current.id, revision: restored.analysisRevision,
    operationKey: `${operationKey}:rollback`, source: "ROLLBACK", before: json(analysisSnapshot(current)), after: json(analysisSnapshot(restored)),
  } });
}
