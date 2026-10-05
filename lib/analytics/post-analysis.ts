import { sentiments } from "../analysis";

// Only expose the known public classification fields from stored JSON.
export function sentimentProbabilities(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const values = value as Record<string, unknown>;
  return sentiments.flatMap(sentiment => {
    const probability = values[sentiment];
    return typeof probability === "number" && Number.isFinite(probability) && probability >= 0 && probability <= 1
      ? [{ sentiment, probability }] : [];
  });
}

export function modelRelevance(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { choice, confidence } = value as Record<string, unknown>;
  return (choice === "YES" || choice === "NO" || choice === "UNCLEAR") && typeof confidence === "number" && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1
    ? { choice, confidence } : null;
}
