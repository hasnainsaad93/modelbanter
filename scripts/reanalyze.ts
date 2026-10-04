import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());

async function main() {
  const { db } = await import("../lib/server/db");
  const { analyzeWithJev, JevError } = await import("../lib/services/jev");
  const { saveStructuredAnalysis, recordAnalysisFailure } = await import("../lib/services/analysis-store");
  const { acquireJobLock, releaseJobLock } = await import("../lib/services/job-lock");
  const { ANALYSIS_VERSION } = await import("../lib/analysis");
  const refresh = process.argv.includes("--refresh");
  const limit = Number(process.env.REANALYZE_LIMIT ?? 100);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("REANALYZE_LIMIT must be 1–1000.");
  const owner = await acquireJobLock("reanalyze");
  if (!owner) { console.log("An analysis run is already active."); await db.$disconnect(); return; }
  try {
    const pending = await db.modelMention.findMany({ where: { ...(refresh ? { NOT: { analysisVersion: { startsWith: `${ANALYSIS_VERSION}/` } } } : { analysisStatus: { in: ["LEGACY", "PENDING", "FAILED"] } }), post: { isDemo: false } }, include: { post: true, model: true }, orderBy: { id: "asc" }, take: limit });
    let completed = 0; let failed = 0;
    for (const mention of pending) {
      try {
        const result = await analyzeWithJev(mention.post.text, mention.model.name);
        await saveStructuredAnalysis(mention.id, result); completed++;
        console.log(JSON.stringify({ event: "analysis.saved", completed, total: pending.length, model: mention.model.name, relevance: result.relevance.choice }));
      } catch (error) {
        await recordAnalysisFailure(mention.id, error); failed++;
        console.error(JSON.stringify({ event: "analysis.failed", message: error instanceof JevError ? error.message : "Could not save analysis" }));
        if (error instanceof JevError && [401, 402, 403, 429].includes(error.status)) break;
      }
    }
    console.log(JSON.stringify({ completed, failed, remainingInBatch: pending.length - completed - failed }));
    if (failed) process.exitCode = 1;
  } finally { await releaseJobLock("reanalyze", owner); await db.$disconnect(); }
}
main().catch(() => { console.error("Could not start analysis. Check the database and TypeSafe configuration."); process.exitCode = 1; });
