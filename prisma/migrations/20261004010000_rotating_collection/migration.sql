ALTER TABLE "Model" ADD COLUMN "lastCollectionAttemptAt" TIMESTAMP(3), ADD COLUMN "collectionCheckpoint" JSONB;
ALTER TABLE "ModelMention" ADD COLUMN "collectionCycleId" TEXT;
CREATE INDEX "ModelMention_collectionCycleId_analysisStatus_idx" ON "ModelMention"("collectionCycleId", "analysisStatus");

-- Preserve the previous collector's ordering information when rotation begins.
UPDATE "Model" m SET "lastCollectionAttemptAt" = (
  SELECT MAX(r."startedAt") FROM "IngestionModelResult" mr
  JOIN "IngestionRun" r ON mr."ingestionRunId" = r.id
  WHERE mr."modelId" = m.id AND mr."pagesRequested" > 0
);
