import type { MetadataRoute } from "next";
import { models } from "@/lib/demo-data";
export default function sitemap(): MetadataRoute.Sitemap { const base = "https://codex-signalist.example"; return ["", "/compare", "/posts", "/methodology", ...models.map((model) => `/models/${model.slug}`)].map((path) => ({ url: `${base}${path}`, lastModified: new Date(), changeFrequency: path === "" ? "hourly" : "daily" })); }

