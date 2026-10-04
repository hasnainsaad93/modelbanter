import { notFound } from "next/navigation";
import { Dashboard } from "@/components/dashboard";
import { DataError, InvalidFilters } from "@/components/data-error";
import { getDashboard, getPosts } from "@/lib/analytics/data";
import { dashboardQuerySchema } from "@/lib/analytics/query";
import type { Metadata } from "next";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Model sentiment" };
export default async function ModelPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const query = dashboardQuerySchema.safeParse({ ...await searchParams, model: slug, vendor: "" });
  if (!query.success) return <InvalidFilters />;
  let data; let evidence;
  try { [data, evidence] = await Promise.all([getDashboard(query.data), getPosts(query.data)]); }
  catch { return <DataError />; }
  if (!data.catalog.some(model => model.slug === slug)) notFound();
  return <Dashboard data={data} evidence={evidence} detail />;
}
