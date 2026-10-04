import { apiError, apiOk } from "@/lib/api";
import { getPosts } from "@/lib/analytics/data";
import { dashboardQuerySchema } from "@/lib/analytics/query";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const query = dashboardQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return apiError("INVALID_QUERY", "Invalid post filters.");
  try { return apiOk(await getPosts(query.data)); } catch { return apiError("DATA_UNAVAILABLE", "Data is temporarily unavailable.", 503); }
}
