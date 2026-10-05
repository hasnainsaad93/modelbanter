export const categories = {
  reasoning: "Reasoning",
  speed: "Speed",
  cost: "Cost",
  code_quality: "Coding",
} as const;
export type Category = keyof typeof categories;
export const categoryKeys = Object.keys(categories) as Category[];
export const sentiments = ["POSITIVE", "NEGATIVE", "NEUTRAL", "MIXED", "NOT_DISCUSSED", "CANNOT_DETERMINE"] as const;
export type Opinion = typeof sentiments[number];
export const MIN_CONFIDENCE = 0.3;
export const MIN_SAMPLE = 5;
export const ANALYSIS_VERSION = "jev-sentiment-v4";
export type Decision = { choice: Opinion; confidence: number; probabilities: Record<Exclude<Opinion, "CANNOT_DETERMINE">, number> & { CANNOT_DETERMINE?: number } };
export type Relevance = { choice: "YES" | "NO" | "UNCLEAR"; confidence: number; probabilities: Record<string, number> };
export type StructuredAnalysis = {
  context?: import("./services/post-context").AnalysisContext;
  contextLookup?: import("./services/post-context").AnalysisContext;
  overall: Decision;
  categories: Record<Category, Decision>;
  relevance: Relevance;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
};

export const countedSentiments = ["POSITIVE", "NEGATIVE", "NEUTRAL", "MIXED"] as const;
export function isCountedOpinion(value: string) { return countedSentiments.some(opinion => opinion === value); }
