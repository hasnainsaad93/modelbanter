import type { Metadata } from "next";
import { ComparePage } from "@/components/compare-page";
export const metadata: Metadata = { title: "Compare models", description: "Compare model sentiment, conversation volume, engagement, strengths, and complaints." };
export default function Page() { return <ComparePage />; }

