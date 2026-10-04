import { apiError, apiOk } from "@/lib/api";
import { db } from "@/lib/server/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return apiOk({ items: await db.model.findMany({ where: { isEnabled: true }, select: { name: true, slug: true, vendor: true, description: true }, orderBy: { displayOrder: "asc" } }) }); }
  catch { return apiError("DATA_UNAVAILABLE", "Data is temporarily unavailable.", 503); }
}
