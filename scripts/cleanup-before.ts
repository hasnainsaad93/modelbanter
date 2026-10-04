import nextEnv from "@next/env";
import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { parseCleanupCutoff } from "../lib/services/cleanup";
nextEnv.loadEnvConfig(process.cwd());

const { values } = parseArgs({ options: { before: { type: "string" }, apply: { type: "boolean", default: false }, "include-history": { type: "boolean", default: false }, "backup-dir": { type: "string", default: "work/data-cleanup" } } });
if (!values.before) throw new Error("Specify --before with an explicit UTC cutoff.");
const cutoff = parseCleanupCutoff(values.before);
const { db } = await import("../lib/server/db");
const { acquireJobLock, releaseJobLock } = await import("../lib/services/job-lock");
const postWhere = { publishedAt: { lt: cutoff } };
const runWhere = { startedAt: { lt: cutoff } };
const locks: { name: string; owner: string }[] = [];
try {
  if (values.apply) {
    for (const name of ["hourly-ingestion", "reanalyze"]) {
      const owner = await acquireJobLock(name);
      if (!owner) throw new Error(`${name} is active; retry cleanup after it finishes.`);
      locks.push({ name, owner });
    }
  }
  const report = await db.$transaction(async tx => {
    if (values.apply) await tx.$executeRawUnsafe('LOCK TABLE "XPost", "ModelMention", "MentionTopic", "IngestionRun", "IngestionModelResult", "Model", "Topic" IN SHARE ROW EXCLUSIVE MODE');
    else await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const totals = async () => ({ posts: await tx.xPost.count(), mentions: await tx.modelMention.count(), topics: await tx.mentionTopic.count(), runs: await tx.ingestionRun.count(), results: await tx.ingestionModelResult.count() });
    const before = await totals();
    const affected = {
      posts: await tx.xPost.count({ where: postWhere }),
      mentions: await tx.modelMention.count({ where: { post: postWhere } }),
      topics: await tx.mentionTopic.count({ where: { mention: { post: postWhere } } }),
      runs: values["include-history"] ? await tx.ingestionRun.count({ where: runWhere }) : 0,
      results: values["include-history"] ? await tx.ingestionModelResult.count({ where: { ingestionRun: runWhere } }) : 0,
    };
    if (!values.apply) return { mode: "preview", cutoff: cutoff.toISOString(), before, affected };
    const models = await tx.model.findMany();
    const topics = await tx.topic.findMany();
    const exportData = {
      posts: await tx.xPost.findMany({ where: postWhere }),
      mentions: await tx.modelMention.findMany({ where: { post: postWhere } }),
      categoryDecisions: await tx.mentionTopic.findMany({ where: { mention: { post: postWhere } } }),
      runs: values["include-history"] ? await tx.ingestionRun.findMany({ where: runWhere }) : [],
      results: values["include-history"] ? await tx.ingestionModelResult.findMany({ where: { ingestionRun: runWhere } }) : [],
      models, topics,
    };
    const directory = resolve(values["backup-dir"]!);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const recordId = randomUUID();
    const backup = resolve(directory, `${recordId}.backup.json`);
    const connection = new URL(process.env.DATABASE_URL!);
    const identity = { host: connection.hostname, database: connection.pathname.slice(1) };
    const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    await writeFile(backup, JSON.stringify({ recordId, exportedAt: new Date().toISOString(), identity, revision, cutoff: cutoff.toISOString(), before, affected, data: exportData }, null, 2), { mode: 0o600, flag: "wx" });
    await tx.xPost.deleteMany({ where: postWhere });
    if (values["include-history"]) await tx.ingestionRun.deleteMany({ where: runWhere });
    const after = await totals();
    for (const key of Object.keys(before) as (keyof typeof before)[]) {
      if (after[key] !== before[key] - affected[key]) throw new Error(`Cleanup verification failed for ${key}; deletion rolled back.`);
    }
    if (await tx.xPost.count({ where: postWhere })) throw new Error("Old posts remain; deletion rolled back.");
    if (JSON.stringify(await tx.model.findMany({ orderBy: { id: "asc" } })) !== JSON.stringify([...models].sort((a, b) => a.id.localeCompare(b.id)))) throw new Error("Catalog changed; deletion rolled back.");
    if (JSON.stringify(await tx.topic.findMany({ orderBy: { id: "asc" } })) !== JSON.stringify([...topics].sort((a, b) => a.id.localeCompare(b.id)))) throw new Error("Topics changed; deletion rolled back.");
    return { recordId, mode: "apply", identity, revision, cutoff: cutoff.toISOString(), before, affected, after, backup, completedAt: new Date().toISOString() };
  }, { timeout: 60000 });
  if (report.mode === "apply" && "recordId" in report) {
    await writeFile(resolve(values["backup-dir"]!, `${report.recordId}.result.json`), JSON.stringify(report, null, 2), { mode: 0o600, flag: "wx" });
  }
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Cleanup failed.");
  process.exitCode = 1;
} finally {
  for (const lock of locks.reverse()) await releaseJobLock(lock.name, lock.owner);
  await db.$disconnect();
}
