export const categories = {
  reasoning: "Reasoning",
  speed: "Speed",
  cost: "Cost",
  code_quality: "Code quality",
} as const;
export type Category = keyof typeof categories;
export const categoryKeys = Object.keys(categories) as Category[];
export const sentiments = ["POSITIVE", "NEGATIVE", "NEUTRAL", "MIXED", "NOT_DISCUSSED"] as const;
export type Opinion = typeof sentiments[number];
export const MIN_CONFIDENCE = 0.3;
export const MIN_SAMPLE = 5;
export const ANALYSIS_VERSION = "jev-sentiment-v2";
export type Decision = { choice: Opinion; confidence: number; probabilities: Record<Opinion, number> };
export type Relevance = { choice: "YES" | "NO" | "UNCLEAR"; confidence: number; probabilities: Record<string, number> };
export type StructuredAnalysis = {
  overall: Decision;
  categories: Record<Category, Decision>;
  relevance: Relevance;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
};
