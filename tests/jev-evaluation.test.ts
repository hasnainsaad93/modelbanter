import { describe, expect, it } from "vitest";
import development from "./fixtures/jev-development.json";
import holdout from "./fixtures/jev-holdout.json";
import behavioral from "./fixtures/jev-behavioral.json";
import { evaluationDatasetSchema, scoreEvaluation } from "../lib/evaluation/jev-evaluation";
import type { Decision, Opinion, StructuredAnalysis } from "../lib/analysis";

const decision = (choice: Opinion, confidence = 0.9): Decision => ({ choice, confidence, probabilities: { POSITIVE: +(choice === "POSITIVE"), NEGATIVE: +(choice === "NEGATIVE"), NEUTRAL: +(choice === "NEUTRAL"), MIXED: +(choice === "MIXED"), NOT_DISCUSSED: +(choice === "NOT_DISCUSSED") } });
function analysis(): StructuredAnalysis { return { model: "jev-test", usage: { input_tokens: 1, output_tokens: 1 }, relevance: { choice: "YES", confidence: 0.9, probabilities: { YES: 1, NO: 0, UNCLEAR: 0 } }, overall: decision("POSITIVE"), categories: { reasoning: decision("NOT_DISCUSSED"), speed: decision("NOT_DISCUSSED"), cost: decision("NOT_DISCUSSED"), code_quality: decision("POSITIVE") } }; }

describe("Jev evaluation integrity", () => {
  it("keeps 156 stored posts and their conversations separate across tuning and reserved sets", () => {
    const dataset = evaluationDatasetSchema.parse({ ...development, cases: [...development.cases, ...holdout.cases] });
    expect(dataset.cases).toHaveLength(156);
    expect(new Set(dataset.cases.map(item => item.xPostId)).size).toBe(156);
    const counts = new Map<string, number>();
    for (const item of dataset.cases) counts.set(item.target.slug!, (counts.get(item.target.slug!) ?? 0) + 1);
    expect(counts.size).toBe(13);
    expect([...counts.values()].every(count => count === 12)).toBe(true);
    expect(dataset.cases.every(item => item.annotation.status === "provisional")).toBe(true);
    expect(evaluationDatasetSchema.parse(behavioral).cases).toHaveLength(32);
  });
  it("rejects cross-split thread or text leakage, including copies with different links", () => {
    const first = development.cases[0];
    const duplicate = { ...first, id: "different-id", xPostId: "different-post", conversationId: "different-thread", text: first.text.replace(/https?:\/\/\S+/g, "https://example.com/new"), split: "holdout" };
    expect(evaluationDatasetSchema.safeParse({ ...development, cases: [first, duplicate] }).success).toBe(false);
    expect(evaluationDatasetSchema.safeParse({ ...development, cases: [first, { ...duplicate, text: "Different text", conversationId: first.conversationId }] }).success).toBe(false);
  });
  it("separates missing discussion, incorrect accepted labels, and ambiguous references", () => {
    const dataset = evaluationDatasetSchema.parse(behavioral);
    const first = { ...dataset.cases[0], id: "first" };
    const second = { ...first, id: "second", expected: { ...first.expected, code_quality: "NOT_DISCUSSED" as const, overall: null } };
    const missing = analysis(); missing.categories.code_quality = decision("NOT_DISCUSSED");
    const included = analysis();
    const report = scoreEvaluation([first, second], [{ id: first.id, variant: "candidate", analysis: missing }, { id: second.id, variant: "candidate", analysis: included }]);
    expect(report.candidate.metrics.code_quality).toMatchObject({ judged: 2, correct: 0, accepted: 1, acceptedCorrect: 0, missedDiscussion: 1, inventedDiscussion: 1 });
    expect(report.candidate.metrics.overall).toMatchObject({ judged: 1, ambiguous: 1, ambiguousAccepted: 1 });
  });
  it("uses the category confidence independently of overall confidence and honors relevance rejection", () => {
    const item = evaluationDatasetSchema.parse(behavioral).cases[0];
    const result = analysis(); result.overall.confidence = 0.1;
    let report = scoreEvaluation([item], [{ id: item.id, variant: "candidate", analysis: result }]);
    expect(report.candidate.metrics.code_quality.accepted).toBe(1);
    expect(report.candidate.metrics.overall.accepted).toBe(0);
    result.relevance.choice = "NO";
    report = scoreEvaluation([item], [{ id: item.id, variant: "candidate", analysis: result }]);
    expect(report.candidate.metrics.code_quality.accepted).toBe(0);
  });
});
