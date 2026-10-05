import { z } from "zod";
import { categoryKeys } from "../analysis";
export const dashboardQuerySchema = z.object({
  analysis: z.enum(["all", "current"]).default("all"),
  range: z.enum(["24h", "7d", "30d", "all"]).default("7d"),
  vendor: z.string().max(80).default(""),
  model: z.string().max(100).default(""),
  category: z.enum(["all", ...categoryKeys]).default("all"),
  sentiment: z.enum(["all", "POSITIVE", "NEGATIVE", "NEUTRAL", "MIXED"]).default("all"),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export function rangeDates(range: DashboardQuery["range"], now: Date) {
  const duration = range === "24h" ? 86400000 : range === "7d" ? 7 * 86400000 : 30 * 86400000;
  return { start: range === "all" ? null : new Date(+now - duration), previous: range === "all" ? null : new Date(+now - duration * 2), end: now };
}
