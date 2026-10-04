import { redirect } from "next/navigation";
export default async function Page({ searchParams }: { searchParams: Promise<{ model?: string }> }) {
  const { model } = await searchParams;
  redirect(model ? `/models/${encodeURIComponent(model)}` : "/");
}
