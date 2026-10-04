import { Dashboard } from "@/components/dashboard";
import { DataError, InvalidFilters } from "@/components/data-error";
import { getDashboard } from "@/lib/analytics/data";
import { dashboardQuerySchema } from "@/lib/analytics/query";
export const dynamic = "force-dynamic";
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = dashboardQuerySchema.safeParse(await searchParams);
  if (!query.success) return <InvalidFilters />;
  let data;
  try { data = await getDashboard(query.data); }
  catch { return <DataError />; }
  return <Dashboard data={data} />;
}
