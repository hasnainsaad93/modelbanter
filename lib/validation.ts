import { z } from "zod";
export const rangeSchema = z.enum(["24h", "7d", "30d", "all"]).default("7d");
export const postQuerySchema = z.object({ model: z.string().optional(), sentiment: z.enum(["positive", "negative", "neutral"]).optional(), q: z.string().max(200).optional(), author: z.string().max(100).optional(), minEngagement: z.coerce.number().int().min(0).default(0), sort: z.enum(["newest", "oldest", "likes", "reposts", "replies", "views", "confidence"]).default("newest"), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) });

