import { apiOk } from "@/lib/api";
import { ingestionRuns } from "@/lib/demo-data";
export async function GET() { return apiOk({ items: ingestionRuns, demo: true }); }

