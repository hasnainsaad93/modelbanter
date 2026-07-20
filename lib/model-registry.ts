export type RegistryModel = {
  id: string; name: string; slug: string; vendor: string; aliases: string[];
  searchQuery: string; isEnabled: boolean;
};

export const modelRegistry: RegistryModel[] = [
  { id: "gpt-sol", name: "GPT-5.6 Sol", slug: "gpt-5-6-sol", vendor: "OpenAI", aliases: ["GPT-5.6 Sol", "GPT 5.6 Sol", "Sol"], searchQuery: '("GPT-5.6 Sol" OR "GPT 5.6 Sol" OR (Sol (LLM OR model OR AI OR coding)))', isEnabled: true },
  { id: "fable", name: "Fable", slug: "fable", vendor: "Fable Labs", aliases: ["Fable model", "Fable"], searchQuery: '("Fable model" OR (Fable (LLM OR model OR AI)))', isEnabled: true },
  { id: "claude-opus", name: "Claude Opus", slug: "claude-opus", vendor: "Anthropic", aliases: ["Claude Opus", "Opus"], searchQuery: '("Claude Opus" OR (Opus (Claude OR Anthropic OR LLM)))', isEnabled: true },
  { id: "kimi-k3", name: "Kimi K3", slug: "kimi-k3", vendor: "Moonshot AI", aliases: ["Kimi K3", "Kimi-K3"], searchQuery: '("Kimi K3" OR "Kimi-K3")', isEnabled: true },
];

