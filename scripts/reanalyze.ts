import nextEnv from "@next/env";
import { parseArgs } from "node:util";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderBatchReview } from "../lib/evaluation/reanalysis-review";
import { z } from "zod";
nextEnv.loadEnvConfig(process.cwd());

async function main() {
  const { values } = parseArgs({ options: {
    create: { type: "boolean" }, refresh: { type: "boolean" }, "fetch-context": { type: "boolean" }, "retry-failed": { type: "boolean" },
    run: { type: "string" }, apply: { type: "string" }, rollback: { type: "string" }, report: { type: "string" },
    limit: { type: "string" }, model: { type: "string" }, since: { type: "string" }, "mention-ids": { type: "string" }, out: { type: "string" }, only: { type: "string" }, references: { type: "string" },
  }, strict: true });
  if ([values.create, values.run, values.apply, values.rollback, values.report].filter(Boolean).length > 1) throw new Error("Choose one action: --create, --run ID, --report ID, --apply ID, or --rollback ID.");
  if (values["retry-failed"] && !values.run) throw new Error("--retry-failed requires --run ID.");
  if (values.only && !values.apply && !values.rollback) throw new Error("--only is supported with --apply or --rollback.");
  if ((values.run || values.apply || values.rollback || values.report) && (values.refresh || values.limit || values.model || values.since || values["mention-ids"] || values["fetch-context"])) throw new Error("A saved batch has fixed selection and context settings. Selection flags are only valid for preview or --create.");
  const { db } = await import("../lib/server/db");
  const { prepareBatch, previewBatch, runBatch, applyBatch, getBatchReport } = await import("../lib/services/reclassification");
  try {
    const selection = { limit: Number(values.limit ?? process.env.REANALYZE_LIMIT ?? 20), refresh: values.refresh ?? false,
      fetchContext: values["fetch-context"] ?? false, model: values.model, since: values.since, mentionIds: values["mention-ids"]?.split(",") };
    if (values.create) {
      const batch = await prepareBatch(selection);
      console.log(JSON.stringify({ batchId: batch.id, selected: batch.items.length, targetVersion: batch.targetVersion, fetchContext: batch.fetchContext, paidCalls: false, classificationsChanged: false }));
      return;
    }
    let report;
    if (values.run) report = await runBatch(values.run, { retryFailed: values["retry-failed"], onProgress: event => console.log(JSON.stringify(event)) });
    else if (values.apply || values.rollback) report = await applyBatch((values.apply ?? values.rollback)!, !!values.rollback, values.only?.split(","));
    else if (values.report) report = await getBatchReport(values.report);
    else { console.log(JSON.stringify(await previewBatch(selection), null, 2)); return; }
    const directory = resolve(values.out ?? `work/reclassification/${report.id}`);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(`${directory}/report.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
    const references = values.references ? z.object({ cases: z.array(z.object({ mentionId: z.string(), expected: z.record(z.string(), z.string().nullable()) })) }).parse(JSON.parse(readFileSync(values.references, "utf8"))) : null;
    writeFileSync(`${directory}/review.html`, renderBatchReview(report, references ? Object.fromEntries(references.cases.map(item => [item.mentionId, item.expected])) : undefined), { mode: 0o600 });
    console.log(JSON.stringify({ batchId: report.id, counts: report.counts, attempts: report.attempts, usage: report.recordedCandidateUsage, review: `${directory}/review.html` }));
    if (report.items.some(item => item.status === "FAILED" || item.status === "CONFLICT" || item.error)) process.exitCode = 1;
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "Reclassification could not complete. Check database connectivity and migrations."); process.exitCode = 1; });
