import { z } from "zod";
import { Prisma } from "@prisma/client";
import { MIN_CONFIDENCE } from "../analysis";
import { collectionStart } from "./collection-window";
import { hasCoverage, type StopReason } from "./collection-coverage";
import { type RegistryModel } from "../model-registry";
import { detectModels } from "./model-detection";
import { createSentimentProvider, type SentimentProvider } from "./sentiment";
import { XApiError, XRecentSearchClient, type XPage, type XPostResponse } from "./x-client";
import { checkpointMatches, freshCheckpoint, readCheckpoint, selectCollectionBatch, type CollectionCheckpoint } from "./collection-checkpoint";

async function getDb() { return (await import("../server/db")).db; }

export type IngestionCounters = { pagesRequested: number; postsFetched: number; postsExamined: number; existingPosts: number; existingAssociations: number; newPostsInserted: number; newAssociationsInserted: number; rejectedPosts: number; analysesCompleted: number; targetReached: boolean; acceptedInCycle: number; pagesInCycle: number; stopReason: StopReason | null; status: "COMPLETED" | "PARTIALLY_COMPLETED" | "RATE_LIMITED" | "USAGE_LIMIT_REACHED" | "FAILED"; errorMessage?: string; rateLimitStatus?: string };
export type IngestionOptions = { target?: number; maxPages?: number; resultsPerPage?: number; deadline?: number; modelsPerRun?: number; modelSlugs?: string[] };
type ModelOptions = IngestionOptions & { checkpoint?: CollectionCheckpoint; saveCheckpoint?: (value: CollectionCheckpoint | null) => Promise<void> };
export interface SearchClient { search(query: string, nextToken?: string, maxResults?: number, endTime?: string): Promise<XPage>; }
export interface MentionStore { stage?(post: XPostResponse, user: { id: string; name: string; username: string } | undefined, model: RegistryModel, cycleId?: string): Promise<boolean>; retryable?(xPostId: string, modelId: string): Promise<boolean>; fail?(xPostId: string, modelId: string, error: unknown): Promise<void>; hasPost(xPostId: string): Promise<boolean>; hasAssociation(xPostId: string, modelId: string): Promise<boolean>; save(post: XPostResponse, user: { id: string; name: string; username: string } | undefined, model: RegistryModel, analysis: Awaited<ReturnType<SentimentProvider["analyze"]>>): Promise<{ newPost: boolean; newAssociation: boolean }>; }

export async function ingestModel(model: RegistryModel, client: SearchClient, store: MentionStore, sentiment: SentimentProvider, options: ModelOptions = {}): Promise<IngestionCounters> {
  const target = options.target ?? 100; const maxPages = options.maxPages ?? 20; const resultsPerPage = options.resultsPerPage ?? 100;
  const counters: IngestionCounters = { pagesRequested: 0, postsFetched: 0, postsExamined: 0, existingPosts: 0, existingAssociations: 0, newPostsInserted: 0, newAssociationsInserted: 0, rejectedPosts: 0, analysesCompleted: 0, targetReached: false, acceptedInCycle: 0, pagesInCycle: 0, stopReason: null, status: "COMPLETED" };
  const start = collectionStart();
  const checkpoint = options.checkpoint ?? freshCheckpoint(model.searchQuery, target, maxPages, resultsPerPage);
  const persist = () => options.saveCheckpoint?.(checkpoint);
  const outOfTime = () => options.deadline !== undefined && Date.now() >= options.deadline;
  try {
    await persist();
    while (checkpoint.accepted < target) {
      if (outOfTime()) { counters.status = "PARTIALLY_COMPLETED"; counters.stopReason = "TIME_BUDGET"; counters.errorMessage = "Collection time budget reached; saved posts and cursor are preserved."; return counters; }
      if (!checkpoint.pending) {
        if (checkpoint.pages >= maxPages || (checkpoint.pages > 0 && !checkpoint.nextToken)) break;
        counters.pagesRequested++;
        const page = await client.search(model.searchQuery, checkpoint.nextToken, resultsPerPage, checkpoint.endTime);
        counters.postsFetched += page.posts.length;
        checkpoint.pages++;
        checkpoint.nextToken = page.nextToken;
        checkpoint.pending = { posts: page.posts, users: [...page.users.values()] };
        // Save the fetched page before analysis so a paused run does not fetch it again.
        await persist();
      }
      const users = new Map(checkpoint.pending.users.map(user => [user.id, user]));
      while (checkpoint.pending.posts.length && checkpoint.accepted < target) {
        if (outOfTime()) { counters.status = "PARTIALLY_COMPLETED"; counters.stopReason = "TIME_BUDGET"; counters.errorMessage = "Collection time budget reached; saved posts and cursor are preserved."; return counters; }
        const post = checkpoint.pending.posts[0];
        counters.postsExamined++;
        if ((start && +new Date(post.created_at) < +start) || !detectModels(post.text, [model]).length) counters.rejectedPosts++;
        else {
          if (await store.hasPost(post.id)) counters.existingPosts++;
          const exists = await store.hasAssociation(post.id, model.id);
          if (exists && !await store.retryable?.(post.id, model.id)) counters.existingAssociations++;
          else {
            const user = users.get(post.author_id);
            if (store.stage && await store.stage(post, user, model, checkpoint.cycleId)) counters.newPostsInserted++;
            try {
              const analysis = await sentiment.analyze(post.text, model.name, model, { rawPayload: post, authorXId: post.author_id, deadline: options.deadline }); counters.analysesCompleted++;
              const saved = await store.save(post, user, model, analysis);
              if (!store.stage && saved.newPost) counters.newPostsInserted++;
              if (saved.newAssociation) { counters.newAssociationsInserted++; checkpoint.accepted++; }
              else if (analysis.structured) counters.rejectedPosts++;
            } catch (error) {
              await store.fail?.(post.id, model.id, error);
              // Retain this post at the front of the buffer for the next attempt.
              throw error;
            }
          }
        }
        checkpoint.pending.posts.shift();
        await persist();
      }
      delete checkpoint.pending;
      await persist();
    }
    counters.targetReached = checkpoint.accepted >= target;
    counters.stopReason = counters.targetReached ? "TARGET_REACHED" : !checkpoint.nextToken ? "SEARCH_EXHAUSTED" : "PAGE_CAP";
    counters.status = counters.targetReached || !checkpoint.nextToken ? "COMPLETED" : "PARTIALLY_COMPLETED";
    // A completed target, exhausted search, or page cap ends this collection cycle.
    await options.saveCheckpoint?.(null);
  } catch (error) {
    if (error instanceof XApiError) {
      counters.stopReason = error.kind === "rate_limit" ? "RATE_LIMIT" : error.kind === "usage_limit" ? "USAGE_LIMIT" : "UPSTREAM_ERROR";
      counters.status = error.kind === "rate_limit" ? "RATE_LIMITED" : error.kind === "usage_limit" ? "USAGE_LIMIT_REACHED" : counters.newAssociationsInserted ? "PARTIALLY_COMPLETED" : "FAILED";
      counters.errorMessage = error.message;
      if (error.kind === "rate_limit" || error.kind === "usage_limit") counters.rateLimitStatus = error.rateLimitSummary;
      if (error.status === 400 && checkpoint.nextToken && /next.?token|pagination|invalid.*token|expired.*token/i.test(error.message)) {
        await options.saveCheckpoint?.(null);
        counters.stopReason = "CURSOR_INVALID";
        counters.errorMessage = "X rejected the saved cursor; stored analyses are preserved and the next rotation starts a fresh search.";
      }
    } else {
      counters.stopReason = "UPSTREAM_ERROR";
      counters.status = counters.newAssociationsInserted ? "PARTIALLY_COMPLETED" : "FAILED";
      counters.errorMessage = error instanceof Error ? error.message : "Unknown ingestion error";
    }
  } finally {
    counters.acceptedInCycle = checkpoint.accepted;
    counters.pagesInCycle = checkpoint.pages;
  }
  return counters;
}

class PrismaMentionStore implements MentionStore {
  async hasPost(xPostId: string) { const db = await getDb(); return Boolean(await db.xPost.findUnique({ where: { xPostId }, select: { id: true } })); }
  async hasAssociation(xPostId: string, modelId: string) { const db = await getDb(); return Boolean(await db.modelMention.findFirst({ where: { modelId, post: { xPostId } }, select: { id: true } })); }
  async retryable(xPostId: string, modelId: string) { const db = await getDb(); return Boolean(await db.modelMention.findFirst({ where: { modelId, post: { xPostId }, analysisStatus: { in: ["PENDING", "FAILED"] } }, select: { id: true } })); }
  async stage(post: XPostResponse, user: { id: string; name: string; username: string } | undefined, model: RegistryModel, cycleId?: string) {
    const db = await getDb();
    return db.$transaction(async tx => {
      const created = await tx.xPost.createMany({ data: [{ xPostId: post.id, authorXId: post.author_id, authorUsername: user?.username ?? "unknown", authorName: user?.name ?? "Unknown", text: post.text, language: post.lang ?? "en", publishedAt: new Date(post.created_at), conversationId: post.conversation_id, likeCount: post.public_metrics?.like_count ?? 0, replyCount: post.public_metrics?.reply_count ?? 0, repostCount: post.public_metrics?.retweet_count ?? 0, quoteCount: post.public_metrics?.quote_count ?? 0, viewCount: post.public_metrics?.impression_count, rawPayload: post as object }], skipDuplicates: true });
      const savedPost = await tx.xPost.findUniqueOrThrow({ where: { xPostId: post.id }, select: { id: true } });
      await tx.modelMention.createMany({ data: [{ postId: savedPost.id, modelId: model.id, collectionCycleId: cycleId, sentiment: "NEUTRAL", sentimentScore: 0, confidence: 0, explanation: "", strengths: [], weaknesses: [], analysisProvider: "pending", analysisVersion: "pending", analysisStatus: "PENDING" }], skipDuplicates: true });
      await tx.modelMention.updateMany({ where: { postId: savedPost.id, modelId: model.id, analysisStatus: { in: ["PENDING", "FAILED"] } }, data: { collectionCycleId: cycleId } });
      return created.count === 1;
    });
  }
  async save(post: XPostResponse, _user: { id: string; name: string; username: string } | undefined, model: RegistryModel, analysis: Awaited<ReturnType<SentimentProvider["analyze"]>>) {
    const db = await getDb();
    const mention = await db.modelMention.findFirstOrThrow({ where: { modelId: model.id, post: { xPostId: post.id } } });
    if (analysis.structured) {
      const { saveStructuredAnalysis } = await import("./analysis-store");
      await saveStructuredAnalysis(mention.id, analysis.structured);
    } else {
      await db.modelMention.update({ where: { id: mention.id }, data: { sentiment: analysis.label, sentimentScore: analysis.score, confidence: analysis.confidence, explanation: analysis.explanation, strengths: analysis.strengths, weaknesses: analysis.weaknesses, analysisProvider: analysis.provider, analysisVersion: analysis.version, analysisStatus: "LEGACY" } });
    }
    return { newPost: false, newAssociation: !analysis.structured || (analysis.structured.relevance.choice === "YES" && analysis.structured.relevance.confidence >= MIN_CONFIDENCE) };
  }
  async fail(xPostId: string, modelId: string, error: unknown) {
    const db = await getDb();
    const mention = await db.modelMention.findFirstOrThrow({ where: { modelId, post: { xPostId } }, select: { id: true } });
    const { recordAnalysisFailure } = await import("./analysis-store");
    await recordAnalysisFailure(mention.id, error);
  }
}

export async function runIngestion(options: IngestionOptions = {}) {
  const settings = z.object({ target: z.number().int().min(1).max(1000).default(100), maxPages: z.number().int().min(1).max(100).default(20), resultsPerPage: z.number().int().min(10).max(100).default(100), modelsPerRun: z.number().int().min(1).max(100).default(3), deadline: z.number().optional(), modelSlugs: z.array(z.string().min(1)).min(1).optional() }).parse(options);
  const deadline = settings.deadline ?? Date.now() + 210000;
  try {
    const db = await getDb();
    const { acquireJobLock, releaseJobLock } = await import("./job-lock");
    const ownerId = await acquireJobLock("hourly-ingestion");
    if (!ownerId) return { status: "skipped", reason: "An ingestion run is already active." };
    let runId: string | undefined;
    try {
      const enabled = await db.model.findMany({ where: { isEnabled: true } });
      if (settings.modelSlugs?.some(slug => !enabled.some(model => model.slug === slug))) throw new Error("Requested collection model is unknown or disabled.");
      const candidates = settings.modelSlugs ? enabled.filter(model => settings.modelSlugs!.includes(model.slug)) : enabled;
      const since = new Date(Date.now() - 7 * 86400000);
      const outcomes = await db.ingestionModelResult.findMany({ where: { modelId: { in: candidates.map(model => model.id) }, targetCount: { gte: settings.target }, startedAt: { gte: since } } });
      const covered = new Set(outcomes.filter(result => hasCoverage(result, settings.target, since)).map(result => result.modelId));
      const records = selectCollectionBatch(candidates, settings.modelsPerRun, covered);
      const run = await db.ingestionRun.create({ data: { status: "RUNNING", metadata: { target: settings.target, maxPages: settings.maxPages, resultsPerPage: settings.resultsPerPage, modelsPerRun: settings.modelsPerRun, selectedModels: records.map(record => record.slug) } } });
      runId = run.id;
      const started = Date.now(); const results = [];
      const client = new XRecentSearchClient(); const sentiment = createSentimentProvider(); const store = new PrismaMentionStore();
      let endpointBlock: Pick<IngestionCounters, "status" | "errorMessage" | "rateLimitStatus"> | undefined;
      for (const record of records) {
        // Unstarted models retain their place in the rotation.
        if (endpointBlock || Date.now() >= deadline) break;
        let checkpoint = readCheckpoint(record.collectionCheckpoint);
        const resumed = !!checkpoint && checkpointMatches(checkpoint, record.searchQuery, settings.target, settings.maxPages, settings.resultsPerPage);
        if (!resumed) checkpoint = freshCheckpoint(record.searchQuery, settings.target, settings.maxPages, settings.resultsPerPage);
        const activeCheckpoint = checkpoint!;
        // Recover the accepted count even if a process died between saving an analysis and its cursor.
        activeCheckpoint.accepted = await db.modelMention.count({ where: { modelId: record.id, collectionCycleId: activeCheckpoint.cycleId, analysisStatus: "COMPLETED" } });
        const modelStartedAt = new Date();
        await db.model.update({ where: { id: record.id }, data: { lastCollectionAttemptAt: modelStartedAt } });
        const modelResult = await db.ingestionModelResult.create({ data: { ingestionRunId: run.id, modelId: record.id, targetCount: settings.target, status: "RUNNING", startedAt: modelStartedAt } });
        console.log(JSON.stringify({ event: "ingestion.model.started", model: record.name, resumed, acceptedInCycle: activeCheckpoint.accepted, target: settings.target }));
        const registryModel = { id: record.id, name: record.name, slug: record.slug, vendor: record.vendor, aliases: record.aliases, searchQuery: record.searchQuery, isEnabled: record.isEnabled };
        const result = await ingestModel(registryModel, client, store, sentiment, { ...settings, deadline, checkpoint: activeCheckpoint,
          saveCheckpoint: async value => { await db.model.update({ where: { id: record.id }, data: { collectionCheckpoint: value ? JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue : Prisma.DbNull } }); },
        });
        results.push({ modelId: record.id, modelName: record.name, resumed, ...result });
        await db.ingestionModelResult.update({ where: { id: modelResult.id }, data: { ...result, collectionCycleId: activeCheckpoint.cycleId, completedAt: new Date(), durationMs: Date.now() - +modelStartedAt } });
        console.log(JSON.stringify({ event: "ingestion.model.finished", model: record.name, status: result.status, newAccepted: result.newAssociationsInserted, acceptedInCycle: activeCheckpoint.accepted, pagesInCycle: activeCheckpoint.pages }));
        if (result.status === "RATE_LIMITED" || result.status === "USAGE_LIMIT_REACHED" || result.errorMessage?.startsWith("TypeSafe") || result.errorMessage?.includes("HTTP 401") || result.errorMessage?.includes("HTTP 403")) endpointBlock = result;
      }
      const hasProgress = results.some((result) => result.newAssociationsInserted > 0);
      const status = results.length === records.length && results.every((result) => result.status === "COMPLETED") ? "COMPLETED" : hasProgress || results.some(result => result.status === "PARTIALLY_COMPLETED") || Date.now() >= deadline ? "PARTIALLY_COMPLETED" : results.some((result) => result.status === "USAGE_LIMIT_REACHED") ? "USAGE_LIMIT_REACHED" : results.some((result) => result.status === "RATE_LIMITED") ? "RATE_LIMITED" : "FAILED";
      const errorMessage = results.find((result) => result.errorMessage)?.errorMessage ?? (Date.now() >= deadline ? "Collection time budget reached; unstarted models will be selected by a later run." : undefined);
      await db.ingestionRun.update({ where: { id: run.id }, data: { status, errorMessage, completedAt: new Date(), durationMs: Date.now() - started } });
      return { runId: run.id, status, results };
    } catch (error) {
      if (runId) {
        await db.ingestionModelResult.updateMany({ where: { ingestionRunId: runId, status: "RUNNING" }, data: { status: "FAILED", completedAt: new Date(), stopReason: "UPSTREAM_ERROR", errorMessage: "Collection interrupted; saved cursor is available for retry." } });
        await db.ingestionRun.update({ where: { id: runId }, data: { status: "FAILED", completedAt: new Date(), errorMessage: "Collection could not finish. Check server logs and retry." } });
      }
      throw error;
    } finally { await releaseJobLock("hourly-ingestion", ownerId); }
  } catch (ex) {
    console.error(JSON.stringify({ event: "ingestion.failed", message: ex instanceof Error ? ex.message : "Unknown ingestion failure" }));
    throw ex;
  }
}
