import { loadEnvFile } from "node:process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Prepare locally; this command does not create or modify cloud resources.
loadEnvFile(resolve(".env"));
const spec = JSON.parse(readFileSync(resolve(".do/app.json"), "utf8"));
const required = ["DATABASE_URL", "CRON_SECRET", "X_BEARER_TOKEN", "TYPESAFE_JEV", "NEXT_PUBLIC_POSTHOG_KEY"];
const missing = required.filter(key => !process.env[key]?.trim());
if (missing.length) throw new Error(`Configure these environment variables before deployment: ${missing.join(", ")}`);

const url = new URL(process.env.DATABASE_URL);
if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") throw new Error("DATABASE_URL must use PostgreSQL.");
if (url.searchParams.get("sslmode") !== "require" && url.searchParams.get("sslmode") !== "verify-full") {
  throw new Error("The production database connection must require SSL.");
}
if (url.pathname !== "/modelbanterdb") throw new Error("The deployment must use modelbanterdb.");
if (["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) throw new Error("The deployment needs the managed database connection.");
url.searchParams.set("connect_timeout", "20");
url.searchParams.set("connection_limit", "5");
for (const variable of spec.envs) {
  if (variable.key === "DATABASE_URL") variable.value = url.toString();
  else if (process.env[variable.key]) variable.value = process.env[variable.key];
}
const directory = resolve("work/digitalocean");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const path = resolve(directory, "app.secret.json");
writeFileSync(path, JSON.stringify(spec, null, 2) + "\n", { mode: 0o600 });
console.log(`Prepared ${path}. This file contains credentials and is excluded from Git.`);
console.log(`Components: web, pre-deployment migrations, collection every four hours (UTC).`);
