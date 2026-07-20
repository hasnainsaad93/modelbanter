import type { ModelMetric, Post } from "./types";

export const models: ModelMetric[] = [
  { name: "GPT-5.6 Sol", slug: "gpt-5-6-sol", vendor: "OpenAI", monogram: "S", color: "#7CFFB2", aliases: ["GPT 5.6 Sol", "GPT-5.6 Sol", "Sol + AI context"], description: "Frontier coding and agentic reasoning model.", mentions: 3824, positive: 2470, negative: 645, neutral: 709, score: 0.62, engagement: 38.4, growth: 18.2, strengths: ["Coding quality", "Tool use", "Reasoning"], weaknesses: ["Rate limits", "Token usage", "Latency"] },
  { name: "Claude Opus", slug: "claude-opus", vendor: "Anthropic", monogram: "O", color: "#F5A97F", aliases: ["Claude Opus", "Opus + Claude context"], description: "Anthropic's high-capability reasoning model.", mentions: 3108, positive: 1785, negative: 723, neutral: 600, score: 0.41, engagement: 32.7, growth: 6.7, strengths: ["Writing quality", "Reasoning", "Context window"], weaknesses: ["Pricing", "Refusals", "Latency"] },
  { name: "Kimi K3", slug: "kimi-k3", vendor: "Moonshot AI", monogram: "K", color: "#73C7FF", aliases: ["Kimi K3", "Kimi-K3"], description: "Efficient long-context model from Moonshot AI.", mentions: 2642, positive: 1671, negative: 432, neutral: 539, score: 0.57, engagement: 29.1, growth: 32.4, strengths: ["Speed", "Pricing", "Context window"], weaknesses: ["Reliability", "Documentation", "Tool use"] },
  { name: "Fable", slug: "fable", vendor: "Fable Labs", monogram: "F", color: "#B89CFF", aliases: ["Fable model", "Fable + LLM context"], description: "Creative and code-focused emerging language model.", mentions: 1873, positive: 988, negative: 401, neutral: 484, score: 0.36, engagement: 24.8, growth: -4.1, strengths: ["Code clarity", "Creativity", "Fine-tuning"], weaknesses: ["Hallucinations", "API experience", "Benchmarks"] },
];

export const trend = [
  { date: "Jul 14", mentions: 1090, positive: 642, negative: 214, score: 0.39 },
  { date: "Jul 15", mentions: 1260, positive: 781, negative: 228, score: 0.44 },
  { date: "Jul 16", mentions: 1198, positive: 710, negative: 252, score: 0.38 },
  { date: "Jul 17", mentions: 1470, positive: 928, negative: 260, score: 0.49 },
  { date: "Jul 18", mentions: 1704, positive: 1082, negative: 316, score: 0.51 },
  { date: "Jul 19", mentions: 2022, positive: 1298, negative: 371, score: 0.54 },
  { date: "Jul 20", mentions: 2703, positive: 1473, negative: 510, score: 0.43 },
];

export const topicRows = [
  { topic: "Coding quality", volume: 2384, positive: 78, change: 14 },
  { topic: "Reasoning", volume: 1947, positive: 71, change: 9 },
  { topic: "Speed", volume: 1620, positive: 82, change: 32 },
  { topic: "Pricing", volume: 1198, positive: 43, change: -7 },
  { topic: "Tool use", volume: 1064, positive: 67, change: 18 },
];

const postSeeds: Omit<Post, "id" | "publishedAt">[] = [
  { author: "Maya Chen", username: "mayacodes", text: "GPT-5.6 Sol just untangled a gnarly Rust lifetime issue and wrote the regression test in one pass. The tool loop feels genuinely dependable now.", model: "GPT-5.6 Sol", modelSlug: "gpt-5-6-sol", sentiment: "positive", confidence: 0.96, likes: 842, replies: 67, reposts: 118, quotes: 24, views: 58600 },
  { author: "Theo Martins", username: "theomakes", text: "Kimi K3 is shockingly fast on a 70k-token repo. Still seeing occasional tool-call retries, but the price/performance is hard to ignore.", model: "Kimi K3", modelSlug: "kimi-k3", sentiment: "positive", confidence: 0.88, likes: 613, replies: 49, reposts: 92, quotes: 18, views: 42100 },
  { author: "Sara Nguyen", username: "saranbuilds", text: "Claude Opus gives the most thoughtful architecture reviews, but today the latency made it impractical for an interactive coding session.", model: "Claude Opus", modelSlug: "claude-opus", sentiment: "negative", confidence: 0.84, likes: 371, replies: 52, reposts: 31, quotes: 12, views: 20800 },
  { author: "Ibrahim A.", username: "ibrahim_ai", text: "Ran Fable on our internal TypeScript benchmark. Clean output, average pass rate, and a couple of fabricated package APIs. Promising, not production-ready yet.", model: "Fable", modelSlug: "fable", sentiment: "neutral", confidence: 0.91, likes: 284, replies: 33, reposts: 44, quotes: 9, views: 18900 },
  { author: "Nora Feld", username: "norafeld", text: "The new Sol agent is very capable, but the hourly quota evaporates during real repository work. Better limits would change the whole experience.", model: "GPT-5.6 Sol", modelSlug: "gpt-5-6-sol", sentiment: "negative", confidence: 0.93, likes: 528, replies: 81, reposts: 66, quotes: 28, views: 37600 },
  { author: "Dev Patel", username: "devdottools", text: "Kimi K3 and Claude Opus both found the bug. Kimi got there faster; Opus explained the concurrency failure more clearly.", model: "Kimi K3", modelSlug: "kimi-k3", sentiment: "positive", confidence: 0.86, likes: 449, replies: 38, reposts: 74, quotes: 15, views: 30200 },
  { author: "Leah Brooks", username: "leahships", text: "Fable's code edits are small and readable. That's an underrated advantage when the human still owns the diff.", model: "Fable", modelSlug: "fable", sentiment: "positive", confidence: 0.94, likes: 267, replies: 19, reposts: 51, quotes: 6, views: 14700 },
  { author: "Owen Li", username: "owenml", text: "Claude Opus pricing remains difficult to justify for high-volume classification. Quality is excellent; unit economics are not.", model: "Claude Opus", modelSlug: "claude-opus", sentiment: "negative", confidence: 0.95, likes: 396, replies: 61, reposts: 48, quotes: 20, views: 25300 },
  { author: "Priya Shah", username: "priyashah", text: "Tested GPT-5.6 Sol against our agent harness. 42/50 tasks completed, 3 required intervention, 5 failed. Full notes coming tomorrow.", model: "GPT-5.6 Sol", modelSlug: "gpt-5-6-sol", sentiment: "neutral", confidence: 0.89, likes: 319, replies: 42, reposts: 38, quotes: 11, views: 22100 },
  { author: "Jon Bell", username: "jonb_ai", text: "Kimi K3 documentation has gaps around structured tool output. The model is good; integration took much longer than it should have.", model: "Kimi K3", modelSlug: "kimi-k3", sentiment: "negative", confidence: 0.9, likes: 188, replies: 24, reposts: 22, quotes: 5, views: 9800 },
];

export const posts: Post[] = Array.from({ length: 30 }, (_, index) => {
  const base = postSeeds[index % postSeeds.length];
  return { ...base, id: `190000000000000${String(index).padStart(3, "0")}`, publishedAt: new Date(Date.now() - index * 1000 * 60 * 77).toISOString(), likes: Math.max(12, base.likes - index * 7), views: Math.max(900, base.views - index * 430) };
});

export const ingestionRuns = [
  { id: "run-812", time: "Today, 4:02 PM", status: "Completed", newPosts: 100, pages: 7, duration: "38.4s" },
  { id: "run-811", time: "Today, 3:01 PM", status: "Partial", newPosts: 74, pages: 10, duration: "52.1s" },
  { id: "run-810", time: "Today, 2:01 PM", status: "Completed", newPosts: 100, pages: 6, duration: "34.8s" },
];

export const summary = {
  total: models.reduce((sum, model) => sum + model.mentions, 0), today: 1248,
  marketScore: 0.49, positive: 6914, negative: 2201, neutral: 2332,
};

export function getModel(slug: string) { return models.find((model) => model.slug === slug); }
