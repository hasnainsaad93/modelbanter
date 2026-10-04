import { db } from "../server/db";
import { catalog } from "./current";

export async function syncCatalog() {
  for (const [index, model] of catalog.entries()) {
    await db.model.upsert({ where: { slug: model.slug }, update: {}, create: { ...model, description: `${model.name} by ${model.vendor}.`, searchQuery: `(${[...new Set(model.aliases)].map(alias => JSON.stringify(alias)).join(" OR ")})`, displayOrder: index } });
  }
  // Retain the old records and their evidence; stop collecting against ambiguous identities.
  await db.model.updateMany({ where: { slug: { in: ["fable", "claude-opus", "gpt-5-6-sol"] } }, data: { isEnabled: false } });
  return catalog.length;
}
