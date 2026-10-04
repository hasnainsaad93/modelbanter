import { analyzeWithJev } from "./jev";
import type { StructuredAnalysis } from "../analysis";
export type SentimentResult = {
  label: "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "MIXED" | "NOT_DISCUSSED"; score: number; confidence: number;
  explanation: string; strengths: string[]; weaknesses: string[]; topics: string[];
  provider: string; version: string; structured?: StructuredAnalysis;
};

export interface SentimentProvider { analyze(text: string, modelName: string): Promise<SentimentResult>; }

const positive = ["fast", "faster", "great", "excellent", "clean", "dependable", "impressive", "good", "love", "best", "capable", "accurate", "cheap", "clear", "reliable"];
const negative = ["slow", "expensive", "bad", "failed", "failure", "bug", "hallucinated", "unreliable", "worse", "quota", "limit", "latency", "retry", "refusal", "gap"];
const negations = new Set(["not", "never", "isn't", "wasn't", "hardly", "without"]);
const topics: Record<string, string[]> = {
  "Coding quality": ["code", "coding", "typescript", "rust", "test", "diff"], Reasoning: ["reasoning", "architecture", "explain"], Speed: ["fast", "faster", "slow", "latency"], Pricing: ["price", "pricing", "expensive", "cheap", "economics"], "Token usage": ["token", "context"], Reliability: ["reliable", "dependable", "retry", "failed"], Hallucinations: ["hallucinated", "fabricated"], "Tool use": ["tool", "agent"], "Rate limits": ["quota", "rate limit", "limits"], Documentation: ["documentation", "docs"], Benchmarks: ["benchmark", "tasks"],
};

export class LocalSentimentProvider implements SentimentProvider {
  async analyze(text: string, modelName: string): Promise<SentimentResult> {
    const lower = text.toLowerCase(); const words = lower.match(/[a-z'-]+/g) ?? [];
    let score = 0; const pos: string[] = []; const neg: string[] = [];
    words.forEach((word, index) => {
      const modifier = negations.has(words[index - 1]) || negations.has(words[index - 2]) ? -1 : 1;
      if (positive.includes(word)) { score += modifier; (modifier > 0 ? pos : neg).push(word); }
      if (negative.includes(word)) { score -= modifier; (modifier > 0 ? neg : pos).push(word); }
    });
    const normalized = Math.max(-1, Math.min(1, score / 3));
    const confidence = Math.min(0.97, 0.5 + Math.abs(score) * 0.12);
    const label = Math.abs(normalized) < 0.2 || confidence < 0.6 ? "NEUTRAL" : normalized > 0 ? "POSITIVE" : "NEGATIVE";
    const detectedTopics = Object.entries(topics).filter(([, terms]) => terms.some((term) => lower.includes(term))).map(([topic]) => topic);
    return { label, score: label === "NEUTRAL" ? 0 : normalized, confidence, explanation: label === "NEUTRAL" ? `No strong directional opinion toward ${modelName} was detected.` : `${label === "POSITIVE" ? "Favorable" : "Critical"} language is directed toward ${modelName}.`, strengths: [...new Set(pos)].slice(0, 3), weaknesses: [...new Set(neg)].slice(0, 3), topics: detectedTopics, provider: "local", version: "local-v1.0.0" };
  }
}

export class JevSentimentProvider implements SentimentProvider {
  async analyze(text: string, modelName: string): Promise<SentimentResult> {
    const structured = await analyzeWithJev(text, modelName);
    const { choice: label, confidence, probabilities } = structured.overall;
    return { label, confidence, score: probabilities.POSITIVE - probabilities.NEGATIVE,
      explanation: "", strengths: [], weaknesses: [], topics: [], provider: "typesafe", version: structured.model, structured };
  }
}
export function createSentimentProvider(): SentimentProvider {
  if (process.env.SENTIMENT_PROVIDER === "local") return new LocalSentimentProvider();
  return new JevSentimentProvider();
}

