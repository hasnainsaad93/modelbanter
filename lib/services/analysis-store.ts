import { Prisma } from "@prisma/client";
import { db } from "../server/db";
import { ANALYSIS_VERSION, categoryKeys, categories, MIN_CONFIDENCE, type StructuredAnalysis } from "../analysis";

export async function saveStructuredAnalysis(mentionId: string, result: StructuredAnalysis) {
  const accepted = result.relevance.choice === "YES" && result.relevance.confidence >= MIN_CONFIDENCE;
  await db.$transaction(async tx => {
    await tx.modelMention.update({ where: { id: mentionId }, data: {
      sentiment: result.overall.choice, sentimentScore: result.overall.probabilities.POSITIVE - result.overall.probabilities.NEGATIVE,
      confidence: result.overall.confidence, probabilities: result.overall.probabilities,
      relevance: result.relevance as unknown as Prisma.InputJsonValue,
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
  });
}

export async function recordAnalysisFailure(mentionId: string, error: unknown) {
  const { JevError } = await import("./jev");
  const message = error instanceof JevError ? error.message : "Analysis failed; retry is required.";
  await db.modelMention.update({ where: { id: mentionId }, data: { analysisStatus: "FAILED", analysisError: message } });
}
