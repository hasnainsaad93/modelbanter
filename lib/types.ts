export type Sentiment = "positive" | "negative" | "neutral";

export type ModelMetric = {
  name: string; slug: string; vendor: string; monogram: string; color: string;
  aliases: string[]; description: string; mentions: number; positive: number;
  negative: number; neutral: number; score: number; engagement: number;
  growth: number; strengths: string[]; weaknesses: string[];
};

export type Post = {
  id: string; author: string; username: string; text: string; publishedAt: string;
  model: string; modelSlug: string; sentiment: Sentiment; confidence: number;
  likes: number; replies: number; reposts: number; quotes: number; views: number;
};

