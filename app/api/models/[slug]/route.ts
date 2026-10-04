import { apiError, apiOk } from "@/lib/api";
import { getDashboard, getPosts } from "@/lib/analytics/data";
import { dashboardQuerySchema } from "@/lib/analytics/query";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const query = dashboardQuerySchema.safeParse({ ...Object.fromEntries(new URL(request.url).searchParams), model: (await params).slug, vendor: "" });
  if (!query.success) return apiError("INVALID_QUERY", "Invalid model filters.");
  try {
    const data = await getDashboard(query.data);
    if (!data.catalog.some(model => model.slug === query.data.model)) return apiError("NOT_FOUND", "Model not found.", 404);
    return apiOk({ ...data, evidence: await getPosts(query.data) });
  } catch { return apiError("DATA_UNAVAILABLE", "Data is temporarily unavailable.", 503); }
}
