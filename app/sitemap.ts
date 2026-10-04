import type { MetadataRoute } from "next";
import { db } from "@/lib/server/db";
import { site } from "@/lib/site";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = site.url;
  const models = await db.model.findMany({ where: { isEnabled: true }, select: { slug: true, updatedAt: true } });
  return [{ url: base, changeFrequency: "daily" }, ...models.map(model => ({ url: `${base}/models/${model.slug}`, lastModified: model.updatedAt, changeFrequency: "daily" as const }))];
}
