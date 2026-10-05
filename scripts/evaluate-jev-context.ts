import nextEnv from "@next/env";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { analyzeWithJev, buildJevRequest } from "../lib/services/jev";
import { JEV_RULE_VERSION } from "../lib/services/jev-prompts";
import type { AnalysisContext } from "../lib/services/post-context";
import type { StructuredAnalysis } from "../lib/analysis";

// Entirely synthetic, supplied context: no Prisma or X calls. Preview by default.
nextEnv.loadEnvConfig(process.cwd());
async function main() {
  const fixture = JSON.parse(readFileSync("tests/fixtures/jev-context-behavioral.json", "utf8")) as {
    target: { name: string; vendor: string; aliases: string[] };
    cases: { id: string; text: string; context: AnalysisContext; expected: Record<string, string> }[];
  };
  if (fixture.cases.length > 20) throw new Error("Context behavioral evaluation is limited to 20 cases.");
  console.log(JSON.stringify({ cases: fixture.cases.length, mode: process.argv.includes("--run") ? "live" : "preview", xRequests: 0, databaseWrites: false }));
  if (!process.argv.includes("--run")) return;
  const results = [];
  for (const item of fixture.cases) {
    const request = buildJevRequest(item.text, fixture.target.name, fixture.target, undefined, item.context);
    const result = await analyzeWithJev(item.text, fixture.target.name, fixture.target, item.context);
    const actual: Record<string, string> = { relevance: result.relevance.choice, overall: result.overall.choice,
      ...Object.fromEntries(Object.entries(result.categories).map(([key, value]) => [key, value.choice])),
    };
    const failures = Object.entries(item.expected).filter(([key, value]) => actual[key] !== value).map(([key, expected]) => ({ question: key, expected, actual: actual[key] }));
    results.push({ id: item.id, requestHash: createHash("sha256").update(JSON.stringify(request)).digest("hex"), failures, actual, usage: result.usage, model: result.model });
    console.log(JSON.stringify({ id: item.id, failures }));
  }
  const usage = results.reduce((sum, result) => ({ input_tokens: sum.input_tokens + result.usage.input_tokens, output_tokens: sum.output_tokens + result.usage.output_tokens }), { input_tokens: 0, output_tokens: 0 } as StructuredAnalysis["usage"]);
  const report = { ruleVersion: JEV_RULE_VERSION, completedAt: new Date().toISOString(), cases: results.length, passed: results.filter(result => !result.failures.length).length, usage, results };
  mkdirSync("work/jev-phase3", { recursive: true });
  writeFileSync("work/jev-phase3/behavioral-results.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, cases: report.cases, usage, report: "work/jev-phase3/behavioral-results.json" }));
  if (report.passed !== report.cases) process.exitCode = 1;
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Context evaluation failed"); process.exitCode = 1; });
