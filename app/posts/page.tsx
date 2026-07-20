import type { Metadata } from "next";
import { PostExplorer } from "@/components/post-explorer";
export const metadata: Metadata = { title: "Post explorer", description: "Search and filter analyzed model conversations from X." };
export default function Page() { return <PostExplorer />; }

