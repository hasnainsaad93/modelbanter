import nextEnv from "@next/env";
import { parseArgs } from "node:util";
import { z } from "zod";
nextEnv.loadEnvConfig(process.cwd());

const { values } = parseArgs({ options: { apply: { type: "boolean", default: false }, since: { type: "string" }, "max-runs": { type: "string", default: "30" } } });
const since = z.coerce.date().max(new Date(), "Coverage start cannot be in the future.").parse(values.since ?? new Date(Date.now() - 7 * 86400000));
const target = z.coerce.number().int().min(1).max(1000).parse(process.env.TARGET_UNIQUE_POSTS_PER_MODEL ?? 100);
const batchSize = z.coerce.number().int().min(1).max(100).parse(process.env.MODELS_PER_RUN ?? 3);
const maxRuns = z.coerce.number().int().min(1).max(100).parse(values["max-runs"]);
const { db } = await import("../lib/server/db");
const { runIngestion } = await import("../lib/services/ingestion");
const { hasCoverage, ingestionFailed } = await import("../lib/services/collection-coverage");

try {
  let complete = false;
  for (let attempt = 0; attempt <= maxRuns; attempt++) {
    const models = await db.model.findMany({ where: { isEnabled: true } });
    const outcomes = await db.ingestionModelResult.findMany({ where: { targetCount: { gte: target }, startedAt: { gte: since } } });
    const covered = new Set(outcomes.filter(result => hasCoverage(result, target, since)).map(result => result.modelId));
    const missing = models.filter(model => !covered.has(model.id));
    console.log(JSON.stringify({ event: "coverage.checked", target, since: since.toISOString(), covered: models.length - missing.length, enabled: models.length, missing: missing.map(model => model.slug) }));
    if (!missing.length) { complete = true; break; }
    if (!values.apply) break;
    if (attempt === maxRuns) throw new Error("Coverage run limit reached; checkpoints remain available for resume.");
    const result = await runIngestion({ target, modelsPerRun: Math.min(batchSize, missing.length), modelSlugs: missing.map(model => model.slug), maxPages: Number(process.env.X_MAX_PAGES_PER_MODEL ?? 20), resultsPerPage: Number(process.env.X_RESULTS_PER_PAGE ?? 100) });
    console.log(JSON.stringify({ event: "coverage.batch", ...result }));
    if (result.status === "skipped") throw new Error("A collection is already running; try again after it finishes.");
    if (ingestionFailed(result)) throw new Error("Collection blocked by an upstream failure; fix the reported error before resuming.");
  }
  console.log(JSON.stringify({ event: "coverage.finished", mode: values.apply ? "apply" : "preview", complete }));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Coverage collection failed.");
  process.exitCode = 1;
} finally { await db.$disconnect(); }
