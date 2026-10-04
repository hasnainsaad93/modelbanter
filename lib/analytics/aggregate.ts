import { categoryKeys, MIN_CONFIDENCE, MIN_SAMPLE, type Category, type Opinion } from "../analysis";
import { rangeDates, type DashboardQuery } from "./query";

export type Counts = { total: number; positive: number; negative: number; neutral: number; mixed: number; positivePercent: number | null; negativePercent: number | null; net: number | null };
export type MetricMention = { modelId: string; sentiment: Opinion; confidence: number; analysisStatus: string; publishedAt: Date; topics: { slug: string; sentiment: Opinion; confidence: number }[] };
export type CatalogModel = { id: string; name: string; slug: string; vendor: string; isEnabled: boolean };
export type ModelRow = CatalogModel & { counts: Counts; overall: Counts; change: number | null; categories: Record<Category, Counts> };
export function emptyCounts(): Counts { return { total: 0, positive: 0, negative: 0, neutral: 0, mixed: 0, positivePercent: null, negativePercent: null, net: null }; }
function count(counts: Counts, opinion: Opinion) {
  if (opinion === "NOT_DISCUSSED") return;
  counts.total++;
  if (opinion === "POSITIVE") counts.positive++;
  if (opinion === "NEGATIVE") counts.negative++;
  if (opinion === "NEUTRAL") counts.neutral++;
  if (opinion === "MIXED") counts.mixed++;
}
function finish(counts: Counts): Counts {
  if (counts.total) {
    counts.positivePercent = counts.positive / counts.total * 100;
    counts.negativePercent = counts.negative / counts.total * 100;
    counts.net = (counts.positive - counts.negative) / counts.total * 100;
  }
  return counts;
}
function decision(mention: MetricMention, category: DashboardQuery["category"]) {
  if (mention.analysisStatus !== "COMPLETED") return null;
  const chosen = category === "all" ? mention : mention.topics.find(topic => topic.slug === category);
  return chosen && chosen.confidence >= MIN_CONFIDENCE && chosen.sentiment !== "NOT_DISCUSSED" ? chosen.sentiment : null;
}
export function aggregate(models: CatalogModel[], mentions: MetricMention[], query: DashboardQuery, now = new Date()) {
  const dates = rangeDates(query.range, now);
  const current = mentions.filter(m => +m.publishedAt <= +now && (!dates.start || +m.publishedAt >= +dates.start));
  const prior = dates.start && dates.previous ? mentions.filter(m => +m.publishedAt >= +dates.previous! && +m.publishedAt < +dates.start!) : [];
  const summarize = (items: MetricMention[], category = query.category) => finish(items.reduce((counts, mention) => { const opinion = decision(mention, category); if (opinion) count(counts, opinion); return counts; }, emptyCounts()));
  const rows: ModelRow[] = models.map(model => {
    const selected = current.filter(m => m.modelId === model.id);
    const counts = summarize(selected);
    const previous = summarize(prior.filter(m => m.modelId === model.id));
    return { ...model, counts, overall: summarize(selected, "all"), change: counts.total >= MIN_SAMPLE && previous.total >= MIN_SAMPLE ? counts.net! - previous.net! : null,
      categories: Object.fromEntries(categoryKeys.map(key => [key, summarize(selected, key)])) as Record<Category, Counts> };
  }).sort((a, b) => b.counts.total - a.counts.total || Number(b.isEnabled) - Number(a.isEnabled) || a.name.localeCompare(b.name));
  const summary = summarize(current);
  const previous = summarize(prior);
  const earliest = current.length ? current.reduce((earliest, mention) => Math.min(earliest, +mention.publishedAt), +now) : +now;
  const start = dates.start ? +dates.start : earliest;
  const chartEnd = query.range === "all" && current.length ? current.reduce((latest, mention) => Math.max(latest, +mention.publishedAt), earliest) : +now;
  const bucketMs = query.range === "24h" ? 3600000 : (chartEnd - start) > 90 * 86400000 ? 7 * 86400000 : 86400000;
  const first = Math.floor(start / bucketMs) * bucketMs;
  const buckets = new Map<number, Counts>();
  for (let time = first; time <= chartEnd; time += bucketMs) buckets.set(time, emptyCounts());
  for (const mention of current) {
    const opinion = decision(mention, query.category);
    if (opinion) count(buckets.get(Math.floor(+mention.publishedAt / bucketMs) * bucketMs)!, opinion);
  }
  return { rows, summary, change: summary.total >= MIN_SAMPLE && previous.total >= MIN_SAMPLE ? summary.net! - previous.net! : null,
    trend: [...buckets.entries()].map(([time, counts]) => ({ date: new Date(time).toISOString(), ...finish(counts) })),
    excluded: current.length - summary.total,
  };
}
