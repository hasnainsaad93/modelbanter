import { apiError, apiOk } from "@/lib/api";
import { getModel, posts, trend } from "@/lib/demo-data";
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) { const model = getModel((await params).slug); if (!model) return apiError("NOT_FOUND", "Tracked model not found.", 404); return apiOk({ model, trend, posts: posts.filter((post) => post.modelSlug === model.slug).slice(0, 12), demo: true }); }

