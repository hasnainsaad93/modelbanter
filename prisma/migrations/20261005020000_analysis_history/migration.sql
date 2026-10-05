ALTER TABLE "ModelMention" ADD COLUMN "analysisRevision" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "AnalysisRevision" (
 "id" TEXT NOT NULL PRIMARY KEY, "mentionId" TEXT NOT NULL, "revision" INTEGER NOT NULL,
 "operationKey" TEXT NOT NULL, "source" TEXT NOT NULL, "before" JSONB NOT NULL, "after" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "AnalysisRevision_mentionId_fkey" FOREIGN KEY ("mentionId") REFERENCES "ModelMention"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AnalysisRevision_operationKey_key" ON "AnalysisRevision"("operationKey");
CREATE UNIQUE INDEX "AnalysisRevision_mentionId_revision_key" ON "AnalysisRevision"("mentionId", "revision");
CREATE TABLE "ReanalysisBatch" (
 "id" TEXT NOT NULL PRIMARY KEY, "targetVersion" TEXT NOT NULL, "classifier" TEXT NOT NULL,
 "ruleFingerprint" TEXT NOT NULL, "fetchContext" BOOLEAN NOT NULL DEFAULT false,
 "filters" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "ReanalysisItem" (
 "id" TEXT NOT NULL PRIMARY KEY, "batchId" TEXT NOT NULL, "mentionId" TEXT NOT NULL,
 "baseRevision" INTEGER NOT NULL, "inputHash" TEXT NOT NULL, "input" JSONB NOT NULL, "before" JSONB NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0, "attemptId" TEXT,
 "candidate" JSONB, "error" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ReanalysisItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ReanalysisBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "ReanalysisItem_mentionId_fkey" FOREIGN KEY ("mentionId") REFERENCES "ModelMention"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ReanalysisItem_batchId_mentionId_key" ON "ReanalysisItem"("batchId", "mentionId");
CREATE INDEX "ReanalysisItem_batchId_status_idx" ON "ReanalysisItem"("batchId", "status");
