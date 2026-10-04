import { apiError, apiOk } from "@/lib/api";
import { db } from "@/lib/server/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try { await db.$queryRaw`SELECT 1`; return apiOk({ status: "healthy", database: "connected", timestamp: new Date().toISOString() }); }
  catch { return apiError("DATABASE_UNAVAILABLE", "Database connection unavailable.", 503); }
}
