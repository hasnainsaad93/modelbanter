import { z } from "zod";
import { sentiments, isCountedOpinion, type StructuredAnalysis } from "../analysis";

export const evaluationQuestions = ["relevance", "overall", "reasoning", "speed", "cost", "code_quality"] as const;
export const evaluationDatasetSchema = z.object({
  schemaVersion: z.literal(1), rubricVersion: z.string(), annotationStatus: z.string(),
  cases: z.array(z.object({
    id: z.string(), source: z.enum(["stored_post", "behavioral"]), xPostId: z.string().optional(), conversationId: z.string().nullable().optional(), text: z.string(), language: z.string().optional(),
    target: z.object({ name: z.string(), vendor: z.string().optional(), slug: z.string().optional(), aliases: z.array(z.string()).optional() }),
    split: z.enum(["development", "holdout", "behavioral"]), sampling: z.string().optional(),
    expected: z.object({ relevance: z.enum(["YES", "NO", "UNCLEAR"]).nullable(), overall: z.enum(sentiments).nullable(), reasoning: z.enum(sentiments).nullable(), speed: z.enum(sentiments).nullable(), cost: z.enum(sentiments).nullable(), code_quality: z.enum(sentiments).nullable() }),
    annotation: z.object({ reviewer: z.string(), status: z.enum(["provisional", "human-reviewed"]), note: z.string() }),
  })).min(1).max(200),
}).superRefine((dataset, ctx) => {
  if (new Set(dataset.cases.map(item => item.id)).size !== dataset.cases.length) ctx.addIssue({ code: "custom", message: "Duplicate case IDs" });
  const groups = new Map<string, string>();
  for (const item of dataset.cases) {
    const textKey = item.text.toLowerCase().replace(/https?:\/\/\S+|@\w+/g, "").replace(/\s+/g, " ").trim();
    const keys = [`text:${textKey}`, ...(item.xPostId ? [`post:${item.xPostId}`] : []), ...(item.conversationId ? [`thread:${item.conversationId}`] : [])];
    for (const key of keys) {
      if (groups.has(key) && groups.get(key) !== item.split) ctx.addIssue({ code: "custom", message: "A post or conversation crosses evaluation splits" });
      groups.set(key, item.split);
    }
  }
});
export type EvaluationCase = z.infer<typeof evaluationDatasetSchema>["cases"][number];
export type EvaluationResult = { id: string; variant: "baseline" | "candidate"; analysis: StructuredAnalysis };

export function scoreEvaluation(cases: EvaluationCase[], results: EvaluationResult[], threshold = 0.3, relevanceThreshold = 0.3) {
  return Object.fromEntries((["baseline", "candidate"] as const).map(variant => {
    const selected = new Map(results.filter(result => result.variant === variant).map(result => [result.id, result.analysis]));
    const metrics = Object.fromEntries(evaluationQuestions.map(question => {
      let judged = 0, correct = 0, accepted = 0, acceptedCorrect = 0, missedDiscussion = 0, inventedDiscussion = 0, ambiguousAccepted = 0, ambiguous = 0, discussedReferences = 0;
      const confusion: Record<string, number> = {};
      for (const item of cases) {
        const analysis = selected.get(item.id);
        if (!analysis) continue;
        const answer = question === "relevance" ? analysis.relevance : question === "overall" ? analysis.overall : analysis.categories[question];
        const expected = item.expected[question];
        const relevant = analysis.relevance.choice === "YES" && analysis.relevance.confidence >= relevanceThreshold;
        const included = question === "relevance" ? analysis.relevance.choice === "YES" && analysis.relevance.confidence >= threshold : relevant && answer.confidence >= threshold && isCountedOpinion(answer.choice);
        if (expected === null) { ambiguous++; if (included) ambiguousAccepted++; continue; }
        if (question !== "relevance" && item.expected.relevance !== "YES") continue;
        judged++; if (answer.choice === expected) correct++;
        const key = `${expected} -> ${answer.choice}`; confusion[key] = (confusion[key] ?? 0) + 1;
        if (included) { accepted++; if (answer.choice === expected) acceptedCorrect++; }
        if (question !== "relevance") {
          if (isCountedOpinion(expected)) { discussedReferences++; if (!included) missedDiscussion++; }
          else if (expected === "NOT_DISCUSSED" && included) inventedDiscussion++;
        }
      }
      return [question, { judged, correct, accuracy: judged ? correct / judged : null, accepted, acceptedCorrect, acceptedAccuracy: accepted ? acceptedCorrect / accepted : null, discussedReferences, missedDiscussion, inventedDiscussion, ambiguous, ambiguousAccepted, confusion }];
    }));
    return [variant, { cases: selected.size, metrics }];
  }));
}
