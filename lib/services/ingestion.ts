import { randomUUID } from "node:crypto";
import { modelRegistry, type RegistryModel } from "../model-registry";
import { detectModels } from "./model-detection";
import { createSentimentProvider, type SentimentProvider } from "./sentiment";
import { XApiError, XRecentSearchClient, type XPage, type XPostResponse } from "./x-client";

async function getDb() { return (await import("../server/db")).db; }

export type IngestionCounters = { pagesRequested: number; postsFetched: number; postsExamined: number; existingPosts: number; existingAssociations: number; newPostsInserted: number; newAssociationsInserted: number; rejectedPosts: number; analysesCompleted: number; targetReached: boolean; status: "COMPLETED" | "PARTIALLY_COMPLETED" | "RATE_LIMITED" | "USAGE_LIMIT_REACHED" | "FAILED" };
export type IngestionOptions = { target?: number; maxPages?: number; resultsPerPage?: number };
export interface SearchClient { search(query: string, nextToken?: string, maxResults?: number): Promise<XPage>; }
export interface MentionStore { hasPost(xPostId: string): Promise<boolean>; hasAssociation(xPostId: string, modelId: string): Promise<boolean>; save(post: XPostResponse, user: { id: string; name: string; username: string } | undefined, model: RegistryModel, analysis: Awaited<ReturnType<SentimentProvider["analyze"]>>): Promise<{ newPost: boolean; newAssociation: boolean }>; }

export async function ingestModel(model: RegistryModel, client: SearchClient, store: MentionStore, sentiment: SentimentProvider, options: IngestionOptions = {}): Promise<IngestionCounters> {
  const target = options.target ?? 25; const maxPages = options.maxPages ?? 10; const resultsPerPage = options.resultsPerPage ?? 100;
  const counters: IngestionCounters = { pagesRequested: 0, postsFetched: 0, postsExamined: 0, existingPosts: 0, existingAssociations: 0, newPostsInserted: 0, newAssociationsInserted: 0, rejectedPosts: 0, analysesCompleted: 0, targetReached: false, status: "COMPLETED" };
  let nextToken: string | undefined;
  try {
    do {
      const page = await client.search(model.searchQuery, nextToken, resultsPerPage); counters.pagesRequested++; counters.postsFetched += page.posts.length;
      for (const post of page.posts) {
        if (counters.newAssociationsInserted >= target) break;
        counters.postsExamined++;
        if (!detectModels(post.text, [model]).length) { counters.rejectedPosts++; continue; }
        const postExists = await store.hasPost(post.id); if (postExists) counters.existingPosts++;
        if (await store.hasAssociation(post.id, model.id)) { counters.existingAssociations++; continue; }
        const analysis = await sentiment.analyze(post.text, model.name); counters.analysesCompleted++;
        const saved = await store.save(post, page.users.get(post.author_id), model, analysis);
        if (saved.newPost) counters.newPostsInserted++; if (saved.newAssociation) counters.newAssociationsInserted++;
      }
      nextToken = page.nextToken;
    } while (counters.newAssociationsInserted < target && nextToken && counters.pagesRequested < maxPages);
    counters.targetReached = counters.newAssociationsInserted >= target;
    counters.status = counters.targetReached || !nextToken ? "COMPLETED" : "PARTIALLY_COMPLETED";
  } catch (error) {
    if (error instanceof XApiError) counters.status = error.kind === "rate_limit" ? "RATE_LIMITED" : error.kind === "usage_limit" ? "USAGE_LIMIT_REACHED" : counters.newAssociationsInserted ? "PARTIALLY_COMPLETED" : "FAILED";
    else counters.status = counters.newAssociationsInserted ? "PARTIALLY_COMPLETED" : "FAILED";
  }
  return counters;
}

class PrismaMentionStore implements MentionStore {
  async hasPost(xPostId: string) { const db = await getDb(); return Boolean(await db.xPost.findUnique({ where: { xPostId }, select: { id: true } })); }
  async hasAssociation(xPostId: string, modelId: string) { const db = await getDb(); return Boolean(await db.modelMention.findFirst({ where: { modelId, post: { xPostId } }, select: { id: true } })); }
  async save(post: XPostResponse, user: { id: string; name: string; username: string } | undefined, model: RegistryModel, analysis: Awaited<ReturnType<SentimentProvider["analyze"]>>) {
    const db = await getDb();
    return db.$transaction(async (tx) => {
      const existing = await tx.xPost.findUnique({ where: { xPostId: post.id }, select: { id: true } });
      const savedPost = existing ?? await tx.xPost.create({ data: { xPostId: post.id, authorXId: post.author_id, authorUsername: user?.username ?? "unknown", authorName: user?.name ?? "Unknown", text: post.text, language: post.lang ?? "en", publishedAt: new Date(post.created_at), conversationId: post.conversation_id, likeCount: post.public_metrics?.like_count ?? 0, replyCount: post.public_metrics?.reply_count ?? 0, repostCount: post.public_metrics?.retweet_count ?? 0, quoteCount: post.public_metrics?.quote_count ?? 0, viewCount: post.public_metrics?.impression_count, rawPayload: post as object }, select: { id: true } });
      const created = await tx.modelMention.createMany({ data: [{ postId: savedPost.id, modelId: model.id, sentiment: analysis.label, sentimentScore: analysis.score, confidence: analysis.confidence, explanation: analysis.explanation, strengths: analysis.strengths, weaknesses: analysis.weaknesses, analysisProvider: analysis.provider, analysisVersion: analysis.version }], skipDuplicates: true });
      return { newPost: !existing, newAssociation: created.count === 1 };
    });
  }
}

export async function runIngestion(options: IngestionOptions = {}) {
  const db = await getDb();
  const ownerId = randomUUID(); const now = new Date(); const expiresAt = new Date(now.getTime() + 55 * 60_000);
  const locked = await db.$transaction(async (tx) => {
    const active = await tx.jobLock.findUnique({ where: { name: "hourly-ingestion" } });
    if (active && active.expiresAt > now) return false;
    await tx.jobLock.upsert({ where: { name: "hourly-ingestion" }, create: { name: "hourly-ingestion", ownerId, expiresAt }, update: { ownerId, expiresAt } }); return true;
  });
  if (!locked) return { status: "skipped", reason: "An ingestion run is already active." };
  const run = await db.ingestionRun.create({ data: { status: "RUNNING", metadata: { target: options.target ?? 25 } } });
  const started = Date.now(); const results = [];
  try {
    const records = await db.model.findMany({ where: { isEnabled: true }, orderBy: { displayOrder: "asc" } });
    const client = new XRecentSearchClient(); const sentiment = createSentimentProvider(); const store = new PrismaMentionStore();
    for (const record of records) {
      const registryModel = modelRegistry.find((item) => item.slug === record.slug) ?? { id: record.id, name: record.name, slug: record.slug, vendor: record.vendor, aliases: record.aliases, searchQuery: record.searchQuery, isEnabled: record.isEnabled };
      registryModel.id = record.id;
      const result = await ingestModel(registryModel, client, store, sentiment, options); results.push({ modelId: record.id, ...result });
      await db.ingestionModelResult.create({ data: { ingestionRunId: run.id, modelId: record.id, targetCount: options.target ?? 25, ...result } });
    }
    const status = results.every((result) => result.status === "COMPLETED") ? "COMPLETED" : results.some((result) => result.newAssociationsInserted > 0) ? "PARTIALLY_COMPLETED" : "FAILED";
    await db.ingestionRun.update({ where: { id: run.id }, data: { status, completedAt: new Date(), durationMs: Date.now() - started } });
    return { runId: run.id, status, results };
  } finally { await db.jobLock.deleteMany({ where: { name: "hourly-ingestion", ownerId } }); }
}
