import { z } from "zod";
import { categories, sentiments, type StructuredAnalysis } from "../analysis";
import { buildJevRequest, type ModelIdentity } from "./jev-prompts";
import { analysisContextSchema } from "./post-context";
export { buildJevQuestions, buildJevRequest } from "./jev-prompts";

const probability = z.number().min(0).max(1);
const decision = z.object({
  type: z.literal("choice"), choice: z.enum(sentiments), confidence: probability,
  probabilities: z.object({ POSITIVE: probability, NEGATIVE: probability, NEUTRAL: probability, MIXED: probability, NOT_DISCUSSED: probability, CANNOT_DETERMINE: probability.optional() }),
});
const relevance = z.object({
  type: z.literal("choice"), choice: z.enum(["YES", "NO", "UNCLEAR"]), confidence: probability,
  probabilities: z.object({ YES: probability, NO: probability, UNCLEAR: probability }),
});
export const structuredAnalysisSchema = z.object({
  model: z.string().min(1), overall: decision.omit({ type: true }), relevance: relevance.omit({ type: true }),
  categories: z.object({ reasoning: decision.omit({ type: true }), speed: decision.omit({ type: true }), cost: decision.omit({ type: true }), code_quality: decision.omit({ type: true }) }),
  usage: z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() }),
  context: analysisContextSchema.optional(), contextLookup: analysisContextSchema.optional(),
}).superRefine((value, ctx) => {
  for (const answer of [value.relevance, value.overall, ...Object.values(value.categories)]) {
    if (Math.abs(Object.values(answer.probabilities).reduce<number>((sum, value) => sum + (value ?? 0), 0) - 1) > .03) ctx.addIssue({ code: "custom", message: "Invalid stored probability distribution" });
  }
});
const responseSchema = z.object({
  model: z.string().min(1),
  answers: z.object({ relevance, overall: decision, reasoning: decision, speed: decision, cost: decision, code_quality: decision }),
  usage: z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() }),
}).superRefine((value, ctx) => {
  for (const [key, answer] of Object.entries(value.answers)) {
    const sum = Object.values(answer.probabilities).reduce<number>((a, b) => a + (b ?? 0), 0);
    if (answer.choice === "CANNOT_DETERMINE" && !("CANNOT_DETERMINE" in answer.probabilities)) ctx.addIssue({ code: "custom", message: "Missing uncertainty probability" });
    if (Math.abs(sum - 1) > 0.03) ctx.addIssue({ code: "custom", message: `Invalid probability distribution: ${key}` });
  }
});

export class JevError extends Error {
  constructor(message: string, public status = 0) { super(message); this.name = "JevError"; }
}

export async function analyzeWithJev(text: string, modelName: string, identity?: ModelIdentity, context?: import("./post-context").AnalysisContext): Promise<StructuredAnalysis> {
  return analyzeJevRequest(buildJevRequest(text, modelName, identity, undefined, context));
}

export async function analyzeJevRequest(request: { model: string; state: unknown; questions: unknown }): Promise<StructuredAnalysis> {
  const key = process.env.TYPESAFE_JEV || process.env.TYPESAFE_API_KEY;
  if (!key) throw new JevError("TypeSafe API key is not configured.");
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = undefined;
    try {
      response = await fetch("https://api.typesafe.ai/v1/systemone", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      if (attempt === 2) throw new JevError("TypeSafe request timed out or could not connect.");
    }
    if (response?.ok) break;
    if (response && response.status !== 429 && response.status < 500) throw new JevError(`TypeSafe rejected the request (HTTP ${response.status}).`, response.status);
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
  }
  if (!response?.ok) throw new JevError(`TypeSafe is unavailable (HTTP ${response?.status ?? 0}).`, response?.status);
  let raw: unknown;
  try { raw = await response.json(); } catch { throw new JevError("TypeSafe returned an invalid response."); }
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) throw new JevError("TypeSafe returned decisions that did not match the required schema.");
  const { answers, model, usage } = parsed.data;
  const questions = request.questions as Record<string, { criteria?: Record<string, unknown> }>;
  for (const name of ["overall", "reasoning", "speed", "cost", "code_quality"] as const) {
    if (questions[name]?.criteria && "CANNOT_DETERMINE" in questions[name].criteria && answers[name].probabilities.CANNOT_DETERMINE === undefined) {
      throw new JevError("TypeSafe returned decisions that did not match the required schema.");
    }
  }
  return { overall: answers.overall, relevance: answers.relevance, model, usage, categories: { reasoning: answers.reasoning, speed: answers.speed, cost: answers.cost, code_quality: answers.code_quality } };
}

export { categories };
