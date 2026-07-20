import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getModel, models } from "@/lib/demo-data";
import { ModelDetail } from "@/components/model-detail";

export function generateStaticParams() { return models.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> { const model = getModel((await params).slug); return { title: model?.name ?? "Model", description: model?.description }; }
export default async function Page({ params }: { params: Promise<{ slug: string }> }) { const model = getModel((await params).slug); if (!model) notFound(); return <ModelDetail model={model} />; }

