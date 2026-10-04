ALTER TYPE "Sentiment" ADD VALUE IF NOT EXISTS 'MIXED';
ALTER TYPE "Sentiment" ADD VALUE IF NOT EXISTS 'NOT_DISCUSSED';
ALTER TABLE "ModelMention"
  ADD COLUMN "analysisStatus" TEXT NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "analysisError" TEXT,
  ADD COLUMN "probabilities" JSONB,
  ADD COLUMN "relevance" JSONB,
  ADD COLUMN "inputTokens" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "outputTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MentionTopic"
  ADD COLUMN "sentiment" "Sentiment" NOT NULL DEFAULT 'NEUTRAL',
  ADD COLUMN "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "probabilities" JSONB;
CREATE INDEX "ModelMention_analysisStatus_idx" ON "ModelMention"("analysisStatus");
