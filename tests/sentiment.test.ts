import { describe, expect, it } from "vitest";
import { LocalSentimentProvider } from "../lib/services/sentiment";
const provider = new LocalSentimentProvider();
describe("local sentiment", () => {
  it("classifies clear praise", async () => expect((await provider.analyze("Kimi K3 is fast, reliable and excellent", "Kimi K3")).label).toBe("POSITIVE"));
  it("recognizes negation", async () => { const result = await provider.analyze("Fable is not good for this code task", "Fable"); expect(result.label).toBe("NEGATIVE"); expect(result.score).toBeLessThan(0); });
  it("returns neutral for weak factual language", async () => expect((await provider.analyze("GPT-5.6 Sol was released today", "GPT-5.6 Sol")).label).toBe("NEUTRAL"));
  it("analyzes multi-model statements independently", async () => { const kimi = await provider.analyze("Kimi K3 is faster than Fable, but Fable produces clean code", "Kimi K3"); const fable = await provider.analyze("Fable produces clean code", "Fable"); expect(kimi.label).toBe("POSITIVE"); expect(fable.label).toBe("POSITIVE"); });
});

