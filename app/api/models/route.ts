import { apiOk } from "@/lib/api";
import { models } from "@/lib/demo-data";
export async function GET() { return apiOk({ items: models, demo: true }); }

