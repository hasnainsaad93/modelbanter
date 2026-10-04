import { Prisma } from "@prisma/client";
import { db } from "../server/db";
import { MIN_CONFIDENCE } from "../analysis";
import { aggregate } from "./aggregate";
import { rangeDates, type DashboardQuery } from "./query";

export async function getDashboard(query: DashboardQuery) {
  const now = new Date();
  const dates = rangeDates(query.range, now);
  const catalog = await db.model.findMany({ where: { OR: [{ isEnabled: true }, { mentions: { some: { post: { isDemo: false } } } }] }, select: { id: true, name: true, slug: true, vendor: true, isEnabled: true }, orderBy: [{ displayOrder: "asc" }, { name: "asc" }] });
  const models = catalog.filter(model => (!query.vendor || model.vendor === query.vendor) && (!query.model || model.slug === query.model));
  const modelIds = models.map(model => model.id);
  const where = { modelId: { in: modelIds }, post: { isDemo: false, publishedAt: { ...(dates.previous ? { gte: dates.previous } : {}), lte: now } } } satisfies Prisma.ModelMentionWhereInput;
  const [mentions, latestRun, latestCollected, storedMentions, pending] = await Promise.all([
    db.modelMention.findMany({ where, select: { modelId: true, sentiment: true, confidence: true, analysisStatus: true, post: { select: { publishedAt: true } }, topics: { select: { sentiment: true, confidence: true, topic: { select: { slug: true } } } } } }),
    db.ingestionRun.findFirst({ where: { NOT: { id: { startsWith: "run-" } } }, orderBy: { startedAt: "desc" }, select: { startedAt: true, completedAt: true, status: true } }),
    db.xPost.findFirst({ where: { isDemo: false, mentions: { some: { modelId: { in: modelIds } } } }, orderBy: { publishedAt: "desc" }, select: { publishedAt: true } }),
    db.modelMention.count({ where: { modelId: { in: modelIds }, post: { isDemo: false } } }),
    db.modelMention.count({ where: { modelId: { in: modelIds }, post: { isDemo: false }, analysisStatus: { in: ["PENDING", "FAILED", "LEGACY"] } } }),
  ]);
  const metrics = aggregate(models, mentions.map(mention => ({ ...mention, publishedAt: mention.post.publishedAt, topics: mention.topics.map(topic => ({ ...topic, slug: topic.topic.slug })) })), query, now);
  return { ...metrics, catalog, query, storedMentions, pending, asOf: now.toISOString(), latestPostAt: latestCollected?.publishedAt.toISOString() ?? null,
    pipeline: latestRun ? { status: latestRun.status, startedAt: latestRun.startedAt.toISOString(), completedAt: latestRun.completedAt?.toISOString() ?? null } : null };
}
export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;

export async function getPosts(query: DashboardQuery) {
  const now = new Date();
  const dates = rangeDates(query.range, now);
  const opinion = query.sentiment === "all" ? { not: "NOT_DISCUSSED" as const } : query.sentiment;
  const where: Prisma.ModelMentionWhereInput = {
    model: { ...(query.model ? { slug: query.model } : {}), ...(query.vendor ? { vendor: query.vendor } : {}) },
    post: { isDemo: false, publishedAt: { ...(dates.start ? { gte: dates.start } : {}), lte: now } },
    analysisStatus: "COMPLETED",
    ...(query.category === "all" ? { confidence: { gte: MIN_CONFIDENCE }, sentiment: opinion } : {
      topics: { some: { topic: { slug: query.category }, confidence: { gte: MIN_CONFIDENCE }, sentiment: opinion } },
    }),
  };
  const pageSize = 12;
  const [total, records] = await Promise.all([
    db.modelMention.count({ where }),
    db.modelMention.findMany({ where, orderBy: [{ post: { publishedAt: "desc" } }, { id: "asc" }], skip: (query.page - 1) * pageSize, take: pageSize,
      select: { id: true, sentiment: true, confidence: true, analysisVersion: true, model: { select: { name: true, slug: true } }, topics: { select: { sentiment: true, confidence: true, topic: { select: { slug: true, name: true } } } },
        post: { select: { xPostId: true, authorName: true, authorUsername: true, text: true, publishedAt: true, likeCount: true, replyCount: true, repostCount: true } } },
    }),
  ]);
  return { total, page: query.page, pages: Math.ceil(total / pageSize), items: records.map(record => {
    const selected = query.category === "all" ? record : record.topics.find(topic => topic.topic.slug === query.category)!;
    return { id: record.id, model: record.model, sentiment: selected.sentiment, confidence: selected.confidence, analysisVersion: record.analysisVersion,
      post: { ...record.post, publishedAt: record.post.publishedAt.toISOString() },
      categories: record.topics.filter(topic => topic.sentiment !== "NOT_DISCUSSED" && topic.confidence >= MIN_CONFIDENCE).map(topic => ({ category: topic.topic.slug, name: topic.topic.name, sentiment: topic.sentiment })) };
  }) };
}
export type PostData = Awaited<ReturnType<typeof getPosts>>;
