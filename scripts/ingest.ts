import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { runIngestion } = await import("../lib/services/ingestion");
const { ingestionFailed } = await import("../lib/services/collection-coverage");
const { db } = await import("../lib/server/db");

runIngestion({ target: Number(process.env.TARGET_UNIQUE_POSTS_PER_MODEL ?? 100), maxPages: Number(process.env.X_MAX_PAGES_PER_MODEL ?? 20), resultsPerPage: Number(process.env.X_RESULTS_PER_PAGE ?? 100), modelsPerRun: Number(process.env.MODELS_PER_RUN ?? 3) })
  .then((result) => {
    console.log(JSON.stringify({ event: "ingestion.complete", ...result }, null, 2));
    if (ingestionFailed(result)) process.exitCode = 1;
  })
  .catch((error) => { console.error(JSON.stringify({ event: "ingestion.failed", message: error instanceof Error ? error.message : "Unknown failure" })); process.exitCode = 1; })
  .finally(async () => { await db.$disconnect(); });
