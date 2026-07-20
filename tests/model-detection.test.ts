import { describe, expect, it } from "vitest";
import { detectModels } from "../lib/services/model-detection";
import { modelRegistry } from "../lib/model-registry";

describe("model detection", () => {
  it("detects specific aliases", () => expect(detectModels("Kimi-K3 is fast", modelRegistry).map((model) => model.slug)).toContain("kimi-k3"));
  it("rejects ambiguous aliases without AI context", () => { expect(detectModels("I listened to Opus and watched Sol set", modelRegistry)).toHaveLength(0); expect(detectModels("The Fable was a good bedtime story", modelRegistry)).toHaveLength(0); });
  it("accepts ambiguous aliases with supporting context", () => expect(detectModels("Claude Opus is my favorite LLM for code", modelRegistry).map((model) => model.slug)).toContain("claude-opus"));
  it("detects multiple models", () => expect(detectModels("Kimi K3 is faster than Fable model", modelRegistry).map((model) => model.slug).sort()).toEqual(["fable", "kimi-k3"]));
});

