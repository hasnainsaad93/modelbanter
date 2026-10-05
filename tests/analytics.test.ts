import { describe, expect, it } from "vitest";
import { aggregate, type MetricMention } from "../lib/analytics/aggregate";
import { dashboardQuerySchema } from "../lib/analytics/query";
const now = new Date("2026-10-04T12:00:00Z");
const models = [{ id: "a", slug: "a", name: "Model A", vendor: "Vendor", isEnabled: true }];
function mention(overrides: Partial<MetricMention> = {}): MetricMention { return { modelId: "a", sentiment: "POSITIVE", confidence: .9, analysisStatus: "COMPLETED", publishedAt: new Date("2026-10-03T12:00:00Z"), topics: [], ...overrides }; }
const query = dashboardQuerySchema.parse({ range: "7d" });
describe("database analytics aggregation", () => {
  it("suppresses period comparisons across classification versions", () => {
    const current = Array.from({ length: 5 }, () => mention({ analysisVersion: "jev-sentiment-v4/jev-1.13.0" }));
    const prior = Array.from({ length: 5 }, () => mention({ analysisVersion: "jev-sentiment-v2/jev-1.13.0", publishedAt: new Date("2026-09-26T12:00:00Z") }));
    const report = aggregate(models, [...current, ...prior], query, now);
    expect(report.mixedAnalysisVersions).toBe(true); expect(report.change).toBeNull(); expect(report.rows[0].change).toBeNull();
    expect(report.analysisVersions).toEqual(["jev-sentiment-v4/jev-1.13.0"]);
  });
  it("excludes cannot-determine from percentages but preserves other independently clear categories", () => {
    const items = [mention({ sentiment: "CANNOT_DETERMINE", topics: [
      { slug: "code_quality", sentiment: "POSITIVE", confidence: .95 },
      { slug: "speed", sentiment: "CANNOT_DETERMINE", confidence: .95 },
    ] })];
    const overall = aggregate(models, items, query, now);
    expect(overall.summary.total).toBe(0); expect(overall.cannotDetermine).toBe(1);
    expect(overall.rows[0].categories.code_quality).toMatchObject({ total: 1, positivePercent: 100 });
    const speed = aggregate(models, items, { ...query, category: "speed" }, now);
    expect(speed.summary.total).toBe(0); expect(speed.cannotDetermine).toBe(1);
    expect(speed.trend.every(bucket => bucket.total === 0)).toBe(true);
  });
  it("includes neutral and mixed in the denominator, excludes uncertain, legacy and unrelated decisions", () => {
    const result = aggregate(models, [mention(), mention({ sentiment: "NEGATIVE" }), mention({ sentiment: "NEUTRAL" }), mention({ sentiment: "MIXED" }), mention({ confidence: .1 }), mention({ analysisStatus: "LEGACY" }), mention({ sentiment: "NOT_DISCUSSED" }), mention({ analysisStatus: "REJECTED" })], query, now);
    expect(result.summary).toMatchObject({ total: 4, positivePercent: 25, negativePercent: 25, net: 0 });
    expect(result.excluded).toBe(4);
  });
  it("uses category-specific opinions and does not infer missing topics", () => {
    const items = [mention({ topics: [{ slug: "speed", sentiment: "NEGATIVE", confidence: .9 }] }), mention()];
    const result = aggregate(models, items, { ...query, category: "speed" }, now);
    expect(result.summary).toMatchObject({ total: 1, positive: 0, negative: 1 });
    expect(result.rows[0].overall.positive).toBe(2);
    expect(result.rows[0].categories.reasoning.total).toBe(0);
  });
  it("separates period boundaries and only compares adequately sized samples", () => {
    const current = Array.from({ length: 5 }, () => mention());
    const prior = Array.from({ length: 5 }, () => mention({ sentiment: "NEGATIVE", publishedAt: new Date("2026-09-26T12:00:00Z") }));
    const result = aggregate(models, [...current, ...prior], query, now);
    expect(result.summary.total).toBe(5);
    expect(result.change).toBe(200);
    expect(aggregate(models, [mention(), ...prior], query, now).change).toBeNull();
    expect(aggregate(models, [...current, ...prior], { ...query, range: "all" }, now).change).toBeNull();
  });
  it("keeps empty chart buckets null instead of treating them as neutral or negative", () => {
    const result = aggregate(models, [], query, now);
    expect(result.trend.length).toBeGreaterThan(0);
    expect(result.trend.every(bucket => bucket.positivePercent === null && bucket.negativePercent === null)).toBe(true);
    expect(result.rows[0].counts.net).toBeNull();
  });
  it("respects the requested date window and excludes future data", () => {
    const old = mention({ publishedAt: new Date("2026-07-20") });
    const future = mention({ publishedAt: new Date("2027-01-01") });
    expect(aggregate(models, [old, future], query, now).summary.total).toBe(0);
    expect(aggregate(models, [old, future], { ...query, range: "all" }, now).summary.total).toBe(1);
  });
  it("rejects invalid filters and pagination", () => {
    expect(dashboardQuerySchema.safeParse({ category: "made-up" }).success).toBe(false);
    expect(dashboardQuerySchema.safeParse({ page: "-1" }).success).toBe(false);
    expect(dashboardQuerySchema.safeParse({ range: "365d" }).success).toBe(false);
  });
});
