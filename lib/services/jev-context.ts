import { MIN_CONFIDENCE, type StructuredAnalysis } from "../analysis";
import { analyzeWithJev } from "./jev";
import { PrismaContextStore } from "./context-store";
import type { ModelIdentity } from "./jev-prompts";
import { contextForPost, postText, resolveContext, type ContextSource, type ContextStore } from "./post-context";

export function needsContext(result: StructuredAnalysis) {
  if (result.relevance.choice === "NO" && result.relevance.confidence >= MIN_CONFIDENCE) return false;
  return result.relevance.choice === "UNCLEAR" || result.relevance.confidence < MIN_CONFIDENCE ||
    [result.overall, ...Object.values(result.categories)].some(decision => decision.choice === "CANNOT_DETERMINE" || decision.confidence < MIN_CONFIDENCE);
}

export async function analyzePostWithJev(text: string, modelName: string, identity: ModelIdentity | undefined, source: ContextSource,
  options: { allowFetch?: boolean; store?: ContextStore; analyze?: typeof analyzeWithJev } = {}): Promise<StructuredAnalysis> {
  const analyze = options.analyze ?? analyzeWithJev;
  const store = options.store ?? new PrismaContextStore();
  const fullText = postText(text, source.rawPayload);
  let context = await resolveContext(contextForPost(fullText, source), store);
  const initialContext = context;
  const first = await analyze(fullText, modelName, identity, context);
  if (options.allowFetch !== false && needsContext(first) && context.references.some(reference => reference.status === "not_loaded")) {
    // Allow two 10s X lookups plus Jev's existing 3 x 20s attempts/backoff.
    // Optional enrichment must not overrun the collection's normal work deadline.
    if (source.deadline !== undefined && Date.now() + 85_000 > source.deadline) {
      return { ...first, context, contextLookup: { ...context, references: context.references.map(reference => reference.status === "not_loaded" ? { ...reference, status: "time_budget" } : reference) } };
    }
    const before = context.references.filter(reference => reference.text).length;
    context = await resolveContext(context, store, true);
    if (context.references.filter(reference => reference.text).length > before) {
      const refined = await analyze(fullText, modelName, identity, context);
      return { ...refined, context, usage: { input_tokens: first.usage.input_tokens + refined.usage.input_tokens, output_tokens: first.usage.output_tokens + refined.usage.output_tokens } };
    }
  }
  return { ...first, context: initialContext, ...(context !== initialContext ? { contextLookup: context } : {}) };
}
