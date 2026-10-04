import { describe, expect, it } from "vitest";
import { detectModels } from "../lib/services/model-detection";
import { modelRegistry, type RegistryModel } from "../lib/model-registry";
const ambiguous: RegistryModel[] = ["Sol", "Opus", "Fable"].map(name => ({ id: name, name, slug: name.toLowerCase(), aliases: [name], vendor: "test", searchQuery: "", isEnabled: true }));
describe("model detection", () => {
  it("detects specific aliases", () => expect(detectModels("Kimi-K3 is fast", modelRegistry).map(model => model.slug)).toContain("kimi-k3"));
  it("rejects ambiguous aliases without AI context", () => { expect(detectModels("I listened to Opus and watched Sol set", ambiguous)).toHaveLength(0); expect(detectModels("The Fable was a good bedtime story", ambiguous)).toHaveLength(0); });
  it("accepts ambiguous aliases with supporting context", () => expect(detectModels("Claude Opus is my favorite LLM for code", ambiguous).map(model => model.slug)).toContain("opus"));
  it("detects multiple specific model versions", () => expect(detectModels("Kimi K3 is faster than Claude Fable 5.1", modelRegistry).map(model => model.slug).sort()).toEqual(["claude-fable-5-1", "kimi-k3"]));
  it("does not assign product-only mentions to particular model versions", () => expect(detectModels("ChatGPT and Claude are useful", modelRegistry)).toHaveLength(0));
});
