import { runIngestion } from "../lib/services/ingestion";

runIngestion({ target: Number(process.env.TARGET_UNIQUE_POSTS_PER_MODEL ?? 25), maxPages: Number(process.env.X_MAX_PAGES_PER_MODEL ?? 10), resultsPerPage: Number(process.env.X_RESULTS_PER_PAGE ?? 100) })
  .then((result) => { console.log(JSON.stringify({ event: "ingestion.complete", ...result }, null, 2)); })
  .catch((error) => { console.error(JSON.stringify({ event: "ingestion.failed", message: error instanceof Error ? error.message : "Unknown failure" })); process.exitCode = 1; });
