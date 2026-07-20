import { apiError, apiOk } from "@/lib/api";
import { models, summary, topicRows, trend } from "@/lib/demo-data";
import { rangeSchema } from "@/lib/validation";
export async function GET(request: Request) { const result = rangeSchema.safeParse(new URL(request.url).searchParams.get("range") ?? "7d"); if (!result.success) return apiError("INVALID_RANGE", "Range must be 24h, 7d, 30d, or all."); return apiOk({ range: result.data, summary, models, trend, topics: topicRows, demo: true }); }

