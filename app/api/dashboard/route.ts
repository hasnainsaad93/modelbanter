import { apiError, apiOk } from "@/lib/api";
import { getDashboard } from "@/lib/analytics/data";
import { dashboardQuerySchema } from "@/lib/analytics/query";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const query = dashboardQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return apiError("INVALID_QUERY", "Invalid dashboard filters.");
  try { return apiOk(await getDashboard(query.data)); } catch { return apiError("DATA_UNAVAILABLE", "Data is temporarily unavailable.", 503); }
}
