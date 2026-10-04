import { apiError, apiOk } from "@/lib/api";
import { db } from "@/lib/server/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return apiOk({ items: await db.ingestionRun.findMany({ orderBy: { startedAt: "desc" }, take: 10, select: { id: true, status: true, startedAt: true, completedAt: true, errorMessage: true, metadata: true, results: { select: { model: { select: { name: true } }, status: true, newPostsInserted: true, analysesCompleted: true, targetCount: true, targetReached: true, acceptedInCycle: true, pagesInCycle: true, stopReason: true, errorMessage: true, startedAt: true, completedAt: true } } } }) }); }
  catch { return apiError("DATA_UNAVAILABLE", "Collection history is temporarily unavailable.", 503); }
}
