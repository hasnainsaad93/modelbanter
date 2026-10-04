import { catalog } from "./catalog/current";
export type RegistryModel = {
  id: string; name: string; slug: string; vendor: string; aliases: string[];
  searchQuery: string; isEnabled: boolean;
};
// Seed metadata and detector fixtures only. Ingestion reads records from PostgreSQL.
export const modelRegistry: RegistryModel[] = catalog.map(model => ({ ...model, id: model.slug, isEnabled: true, searchQuery: `(${model.aliases.map(alias => JSON.stringify(alias)).join(" OR ")})` }));
