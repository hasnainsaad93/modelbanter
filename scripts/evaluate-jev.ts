import nextEnv from "@next/env";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { evaluationDatasetSchema, scoreEvaluation, type EvaluationResult } from "../lib/evaluation/jev-evaluation";
import { buildBaselineQuestions } from "../lib/evaluation/jev-baseline";
import { buildJevRequest, JEV_RULE_VERSION } from "../lib/services/jev-prompts";
import { analyzeJevRequest } from "../lib/services/jev";

nextEnv.loadEnvConfig(process.cwd());
const args = process.argv.slice(2);
function option(name: string, fallback: string) { const i = args.indexOf(name); if (i < 0) return fallback; if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`Missing value for ${name}`); return args[i + 1]; }
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function main() {
  const datasetPath = resolve(option("--dataset", "tests/fixtures/jev-development.json"));
  const dataset = evaluationDatasetSchema.parse(JSON.parse(readFileSync(datasetPath, "utf8")));
  const classifier = option("--model", "jev-1.13.0");
  if (!/^jev-\d+\.\d+\.\d+$/.test(classifier)) throw new Error("Use a fixed Jev version, not a moving alias.");
  const output = resolve(option("--out", "work/jev-evaluation/development"));
  const maxCalls = Number(option("--max-calls", "400"));
  if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 400) throw new Error("max-calls must be 1–400");
  const jobs = dataset.cases.flatMap(item => (["baseline", "candidate"] as const).map(variant => {
    const request = variant === "baseline" ? { model: classifier, state: { target_model: item.target.name, post: item.text }, questions: buildBaselineQuestions(item.target.name) } : buildJevRequest(item.text, item.target.name, item.target, classifier);
    return { item, variant, request, key: hash({ id: item.id, variant, request }) };
  }));
  mkdirSync(output, { recursive: true, mode: 0o700 });
  const resultsPath = `${output}/results.jsonl`;
  type StoredResult = EvaluationResult & { key: string; completedAt: string };
  const saved: StoredResult[] = existsSync(resultsPath) ? readFileSync(resultsPath, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
  const validKeys = new Set(jobs.map(job => job.key));
  const results = saved.filter(result => validKeys.has(result.key));
  const completed = new Set(results.map(result => result.key));
  const pending = jobs.filter(job => !completed.has(job.key));
  console.log(JSON.stringify({ mode: args.includes("--run") ? "live" : "preview", cases: dataset.cases.length, comparisons: jobs.length, pending: pending.length, classifier, annotationStatus: dataset.annotationStatus, output, databaseWrites: false, xRequests: 0 }));
  if (!args.includes("--run")) return;
  if (pending.length > maxCalls) throw new Error("Pending calls exceed the evaluation budget; raise --max-calls within 400.");
  let cursor = 0, stopped = false, failure: unknown;
  let inputTokens = results.reduce((sum, result) => sum + result.analysis.usage.input_tokens, 0);
  if (inputTokens >= 2_000_000 && pending.length) throw new Error("Recorded input-token cap already reached; do not resume paid calls.");
  // Three workers; stop after any failed analysis or 2M recorded input tokens.
  // Transport retries remain bounded by analyzeJevRequest. No Prisma imports.
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (!stopped && cursor < pending.length) {
      const job = pending[cursor++];
      try {
        const analysis = await analyzeJevRequest(job.request);
        if (analysis.model !== classifier) throw new Error("Provider resolved a different model; comparison cannot proceed.");
        const result = { id: job.item.id, variant: job.variant, analysis, key: job.key, completedAt: new Date().toISOString() };
        appendFileSync(resultsPath, `${JSON.stringify(result)}\n`, { mode: 0o600 });
        results.push(result); inputTokens += analysis.usage.input_tokens;
        if (results.length % 20 === 0) console.log(JSON.stringify({ completed: results.length, total: jobs.length, inputTokens }));
        if (inputTokens >= 2_000_000) throw new Error("Recorded input-token cap reached; remaining jobs were not started.");
      } catch (error) { stopped = true; failure = error; }
    }
  }));
  const report = {
    dataset: datasetPath, datasetHash: hash(dataset), candidateRequestHash: hash(jobs.filter(job => job.variant === "candidate").map(job => job.request)),
    ruleVersion: JEV_RULE_VERSION, classifier, annotationStatus: dataset.annotationStatus, completed: results.length, planned: jobs.length,
    inputTokens, outputTokens: results.reduce((sum, result) => sum + result.analysis.usage.output_tokens, 0),
    estimatedRecordedCostUsd: inputTokens / 1_000_000 * 0.042,
    pricingNote: "Estimate at published $0.042/M input tokens; not an invoice and excludes any unrecorded failed/retried calls.",
    thresholdNote: "Each question's cutoff varies independently; sentiment curves hold the relevance cutoff at 0.3.",
    thresholds: Object.fromEntries([0.3, 0.4, 0.5, 0.6, 0.7].map(threshold => [threshold, scoreEvaluation(dataset.cases, results, threshold)])),
    strata: Object.fromEntries([...new Set(dataset.cases.map(item => item.sampling ?? "behavioral"))].map(stratum => [stratum, scoreEvaluation(dataset.cases.filter(item => (item.sampling ?? "behavioral") === stratum), results.filter(result => dataset.cases.some(item => item.id === result.id && (item.sampling ?? "behavioral") === stratum)))])),
  };
  writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ completed: results.length, planned: jobs.length, inputTokens, estimatedRecordedCostUsd: report.estimatedRecordedCostUsd, report: `${output}/report.json` }));
  if (failure) throw failure;
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Evaluation failed"); process.exitCode = 1; });
