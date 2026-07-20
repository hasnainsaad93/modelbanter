import { apiError, apiOk } from "@/lib/api";
import { runIngestion } from "@/lib/services/ingestion";

export function isCronAuthorized(request: Request, env: { NODE_ENV?: string; CRON_SECRET?: string } = process.env) {
  if (env.NODE_ENV !== "production" && !env.CRON_SECRET) return true;
  if (!env.CRON_SECRET) return false;
  return request.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;
}

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) return apiError("UNAUTHORIZED", "A valid cron bearer token is required.", 401);
  try { const result = await runIngestion({ target: Number(process.env.TARGET_UNIQUE_POSTS_PER_MODEL ?? 25), maxPages: Number(process.env.X_MAX_PAGES_PER_MODEL ?? 10), resultsPerPage: Number(process.env.X_RESULTS_PER_PAGE ?? 100) }); return apiOk(result, { status: result.status === "skipped" ? 202 : 200 }); }
  catch { return apiError("INGESTION_FAILED", "The ingestion run could not be started.", 500); }
}
