import { PrismaClient, RunStatus, Sentiment } from "@prisma/client";
import { models, posts, ingestionRuns } from "../lib/demo-data";

const prisma = new PrismaClient();
async function main() {
  for (const [index, model] of models.entries()) await prisma.model.upsert({ where: { slug: model.slug }, update: {}, create: { name: model.name, slug: model.slug, vendor: model.vendor, description: model.description, aliases: model.aliases, searchQuery: model.aliases.map((alias) => `"${alias}"`).join(" OR "), visual: model.color, displayOrder: index } });
  for (const [index, post] of posts.entries()) {
    const savedPost = await prisma.xPost.upsert({ where: { xPostId: post.id }, update: {}, create: { xPostId: post.id, authorXId: `demo-author-${index % 10}`, authorUsername: post.username, authorName: post.author, text: post.text, publishedAt: new Date(post.publishedAt), likeCount: post.likes, replyCount: post.replies, repostCount: post.reposts, quoteCount: post.quotes, viewCount: post.views, isDemo: true } });
    const model = await prisma.model.findUniqueOrThrow({ where: { slug: post.modelSlug } });
    await prisma.modelMention.upsert({ where: { postId_modelId: { postId: savedPost.id, modelId: model.id } }, update: {}, create: { postId: savedPost.id, modelId: model.id, sentiment: post.sentiment.toUpperCase() as Sentiment, sentimentScore: post.sentiment === "positive" ? .7 : post.sentiment === "negative" ? -.65 : 0, confidence: post.confidence, explanation: `Demo ${post.sentiment} classification directed toward ${model.name}.`, strengths: post.sentiment === "positive" ? model.aliases.slice(0, 1) : [], weaknesses: post.sentiment === "negative" ? ["User-reported friction"] : [], analysisProvider: "local", analysisVersion: "seed-v1" } });
  }
  for (const run of ingestionRuns) await prisma.ingestionRun.upsert({ where: { id: run.id }, update: {}, create: { id: run.id, status: run.status === "Completed" ? RunStatus.COMPLETED : RunStatus.PARTIALLY_COMPLETED, startedAt: new Date(Date.now() - ingestionRuns.indexOf(run) * 3600000), completedAt: new Date(), durationMs: Math.round(parseFloat(run.duration) * 1000), metadata: { demo: true, newPosts: run.newPosts, pages: run.pages } } });
  console.log(`Seeded ${models.length} models, ${posts.length} posts, and ${ingestionRuns.length} ingestion runs.`);
}
main().finally(() => prisma.$disconnect());

