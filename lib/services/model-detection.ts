import type { RegistryModel } from "../model-registry";

const AI_CONTEXT = /\b(ai|llm|language model|model|agent|coding|code|token|prompt|inference|benchmark|api|anthropic|openai)\b/i;
const AMBIGUOUS = new Set(["sol", "opus", "fable"]);

export function detectModels(text: string, registry: RegistryModel[]): RegistryModel[] {
  return registry.filter((model) => model.aliases.some((alias) => {
    const found = new RegExp(`(^|\\W)${escapeRegExp(alias)}($|\\W)`, "i").test(text);
    return found && (!AMBIGUOUS.has(alias.toLowerCase()) || AI_CONTEXT.test(text));
  }));
}

function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

