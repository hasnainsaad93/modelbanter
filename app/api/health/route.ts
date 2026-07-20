import { apiOk } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET() { return apiOk({ status: "healthy", timestamp: new Date().toISOString(), mode: process.env.NEXT_PUBLIC_DEMO_MODE === "false" ? "live" : "demo", version: "1.0.0" }); }

