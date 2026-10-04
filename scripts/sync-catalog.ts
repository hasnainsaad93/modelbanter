import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { syncCatalog } = await import("../lib/catalog/sync");
const { db } = await import("../lib/server/db");
try { console.log(`Catalog ready: ${await syncCatalog()} current models. Existing model settings preserved.`); }
finally { await db.$disconnect(); }
