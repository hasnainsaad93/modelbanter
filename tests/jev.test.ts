import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeWithJev, buildJevQuestions } from "../lib/services/jev";
import { buildJevRequest, identityForJev } from "../lib/services/jev-prompts";
function decision(choice = "POSITIVE") { return { type: "choice", choice, confidence: .9, probabilities: { CANNOT_DETERMINE: choice === "CANNOT_DETERMINE" ? 1 : 0, POSITIVE: choice === "POSITIVE" ? 1 : 0, NEGATIVE: choice === "NEGATIVE" ? 1 : 0, NEUTRAL: 0, MIXED: 0, NOT_DISCUSSED: choice === "NOT_DISCUSSED" ? 1 : 0 } }; }
function response() { return { model: "jev-test", usage: { input_tokens: 123, output_tokens: 42 }, answers: { relevance: { type: "choice", choice: "YES", confidence: 1, probabilities: { YES: 1, NO: 0, UNCLEAR: 0 } }, overall: decision(), reasoning: decision("NOT_DISCUSSED"), code_quality: decision(), speed: decision("NEGATIVE"), cost: decision("NOT_DISCUSSED") } }; }
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("Jev decisions", () => {
  it("preserves cannot-determine independently and rejects omitted v4 probabilities", async () => {
    vi.stubEnv("TYPESAFE_JEV", "test-only-key");
    const body = response(); body.answers.cost = decision("CANNOT_DETERMINE");
    const fetch = vi.fn().mockResolvedValue(Response.json(body)); vi.stubGlobal("fetch", fetch);
    const result = await analyzeWithJev("Model A writes great code; its price…", "Model A");
    expect(result.categories.cost.choice).toBe("CANNOT_DETERMINE");
    expect(result.categories.code_quality.choice).toBe("POSITIVE");
    const missing = JSON.parse(JSON.stringify(response())); delete missing.answers.cost.probabilities.CANNOT_DETERMINE;
    fetch.mockResolvedValue(Response.json(missing));
    await expect(analyzeWithJev("text", "Model A")).rejects.toThrow("required schema");
  });
  it("passes verified identity metadata and pins the default classifier", async () => {
    vi.stubEnv("TYPESAFE_JEV", "test-only-key"); vi.stubEnv("TYPESAFE_MODEL", "");
    const fetch = vi.fn().mockResolvedValue(Response.json(response())); vi.stubGlobal("fetch", fetch);
    const identity = { name: "Claude Opus 5.5", vendor: "Anthropic", aliases: ["Opus 5.5", "Claude Opus 5.5", "Opus", "Claude"] };
    await analyzeWithJev("Opus 5.5 writes great code", identity.name, identity);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).toEqual(buildJevRequest("Opus 5.5 writes great code", identity.name, identity));
    expect(body.model).toBe("jev-1.13.0");
    expect(body.state.model_identity).toMatchObject({ vendor: "Anthropic", version: "5.5", aliases: ["Opus 5.5", "Claude Opus 5.5"] });
  });
  it("does not promote an incomplete search alias to an exact model identity", () => {
    const identity = identityForJev("DeepSeek V4.1 Flash", { name: "DeepSeek V4.1 Flash", aliases: ["DeepSeek V4.1", "DeepSeek-V4.1-Flash", "Flash", "4.1"] });
    expect(identity.aliases).toEqual(["DeepSeek-V4.1-Flash"]);
  });
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
