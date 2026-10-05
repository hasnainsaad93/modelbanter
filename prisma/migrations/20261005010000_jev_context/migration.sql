-- Additive only: no existing posts or classifications are changed.
ALTER TYPE "Sentiment" ADD VALUE 'CANNOT_DETERMINE';
ALTER TABLE "ModelMention" ADD COLUMN "analysisContext" JSONB;
CREATE TABLE "XPostContext" (
    "xPostId" TEXT NOT NULL,
    "text" TEXT,
    "authorXId" TEXT,
    "status" TEXT NOT NULL,
    "claimToken" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "XPostContext_pkey" PRIMARY KEY ("xPostId")
);
CREATE TABLE "XContextBudget" (
    "day" TEXT NOT NULL,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "blockedUntil" TIMESTAMP(3),
    CONSTRAINT "XContextBudget_pkey" PRIMARY KEY ("day")
);
