ALTER TABLE "IngestionModelResult"
  ADD COLUMN "collectionCycleId" TEXT,
  ADD COLUMN "acceptedInCycle" INTEGER,
  ADD COLUMN "pagesInCycle" INTEGER,
  ADD COLUMN "stopReason" TEXT;

-- Old target-reaching results are known terminal outcomes. Do not infer
-- cycle totals from partial attempts, which may have resumed earlier work.
UPDATE "IngestionModelResult"
SET "stopReason" = CASE
  WHEN "targetReached" THEN 'TARGET_REACHED'
  WHEN "status" = 'COMPLETED' THEN 'SEARCH_EXHAUSTED'
  ELSE NULL
END;
