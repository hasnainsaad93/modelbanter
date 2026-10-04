import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeWithJev, buildJevQuestions } from "../lib/services/jev";
function decision(choice = "POSITIVE") { return { type: "choice", choice, confidence: .9, probabilities: { POSITIVE: choice === "POSITIVE" ? 1 : 0, NEGATIVE: choice === "NEGATIVE" ? 1 : 0, NEUTRAL: 0, MIXED: 0, NOT_DISCUSSED: choice === "NOT_DISCUSSED" ? 1 : 0 } }; }
function response() { return { model: "jev-test", usage: { input_tokens: 123, output_tokens: 42 }, answers: { relevance: { type: "choice", choice: "YES", confidence: 1, probabilities: { YES: 1, NO: 0, UNCLEAR: 0 } }, overall: decision(), reasoning: decision("NOT_DISCUSSED"), code_quality: decision(), speed: decision("NEGATIVE"), cost: decision("NOT_DISCUSSED") } }; }
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("Jev decisions", () => {
  it("sends six independent target-specific questions in a single request and preserves missing/mixed dimensions", async () => {
    vi.stubEnv("TYPESAFE_JEV", "test-only-key");
    const fetch = vi.fn().mockResolvedValue(Response.json(response())); vi.stubGlobal("fetch", fetch);
    const result = await analyzeWithJev("Model A writes good code but is slow", "Model A");
    expect(result.categories.speed.choice).toBe("NEGATIVE");
    expect(result.categories.reasoning.choice).toBe("NOT_DISCUSSED");
    expect(result.usage.input_tokens).toBe(123);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(Object.keys(body.questions)).toHaveLength(6);
    expect(body.state.target_model).toBe("Model A");
    expect(Object.values(buildJevQuestions("Model B")).every(question => question.instructions.includes('"Model B"'))).toBe(true);
  });
  it("rejects incomplete decisions rather than silently assigning neutral", async () => {
    vi.stubEnv("TYPESAFE_JEV", "test-only-key"); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ answers: {} })));
    await expect(analyzeWithJev("text", "Model A")).rejects.toThrow("required schema");
  });
  it("rejects invalid probability distributions", async () => {
    vi.stubEnv("TYPESAFE_JEV", "test-only-key"); const body = response(); body.answers.overall.probabilities.NEGATIVE = 1;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    await expect(analyzeWithJev("text", "Model A")).rejects.toThrow("required schema");
  });
  it("does not retry credential errors or expose the token in errors", async () => {
    vi.stubEnv("TYPESAFE_JEV", "test-only-key"); const fetch = vi.fn().mockResolvedValue(new Response("private details", { status: 401 })); vi.stubGlobal("fetch", fetch);
    await expect(analyzeWithJev("text", "Model A")).rejects.toThrow("HTTP 401");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
