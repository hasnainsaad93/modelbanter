# Collection coverage and October cleanup runbook

The user approved implementation on October 4, 2026. The collection fix and October cleanup were applied locally to `codex_signalist` on localhost. Local coverage improved from 3 to all 13 models reaching the 100-mention target. An initial credit shortage interrupted the backfill; after funding and explicit authorization, only the remaining three models were collected. After the user deployed the changes and authorized replacing production data, the local application dataset was copied to DigitalOcean `modelbanterdb` on October 5 UTC (October 4 Eastern). This document preserves the original investigation and records the implementation, data changes, and verified production replacement.

## Evidence from the local database

The original inspection used a read-only transaction against `codex_signalist` on localhost. At that time the configured `postgres` role could connect but lacked table permissions, so the existing owner connection was used for inspection. After implementation was approved, the owner granted that local role schema usage and SELECT/INSERT/UPDATE/DELETE on the eight application tables. No superuser or DDL privileges were granted. These local grants are not a production migration.

At the original inspection, two collection runs existed in October:

| Started on October 4 in Eastern time | Target per model | Models attempted | Outcome |
| --- | ---: | ---: | --- |
| 2:19 p.m. | 1 | 13 | Every model reached its one-post target |
| 2:52 p.m. | 100 | 3 | Astra, Sol, and K3 each accepted 100 new mentions |

The second run took 87.39 seconds, below its 210-second budget. Each model used two X search pages. No quota, rate-limit, or other error was recorded in that run. At that point the remaining ten models had no recorded attempt with a target of 100. Their initial searches returned nine or ten candidate posts, but stopped when one was accepted; this does not establish that 100 relevant posts were available.

## Why only three models were collected

`runIngestion` first selects at most `MODELS_PER_RUN` records, defaulting to three, then loops over that selected list. Finishing the batch does not start another batch. `selectCollectionBatch` sorts enabled models by oldest attempt, then display order, then ID. All models had the same attempt timestamp after the one-post run. Astra and Sol sorted first; K3 and Luna shared display order 2, with K3's older ID sorting first.

The next batch calculated from the original stored state was GPT-6 Luna, Claude Fable 5.1, and Claude Opus 5.5. There was no active job lock or saved checkpoint in the original local snapshot. The rotation is able to select the other models on subsequent invocations; there is no evidence of a loop repeatedly selecting only the original three.

Starting the local Next.js app does not schedule collection. The repository's DigitalOcean specification schedules one invocation every four hours. Its actual deployed schedule and job invocations remain unverified because the available DigitalOcean CLI credentials cannot access the deployed app. The local database is now separate from the live managed database, so its absence of later runs cannot establish a production scheduler failure.

Relevant sources:

- `lib/services/ingestion.ts`: batch selection, shared time budget, and run status.
- `lib/services/collection-checkpoint.ts`: rotation and resumable collection.
- `scripts/ingest.ts`: environment settings and exit status.
- `.do/app.json`: proposed deployed collection schedule.

## Implemented coverage behavior

- Scheduled collection prioritizes enabled models without a terminal outcome at the configured target in the last seven days. Within covered and incomplete groups, oldest-attempt rotation is preserved. One-post credential checks do not establish target-100 coverage.
- Each per-model result persists the cycle ID, cumulative accepted count, cumulative pages, requested target, attempt/completion times, and stop reason. Historical target/exhaustion outcomes are preserved; missing historical cumulative counts are not fabricated.
- `TARGET_REACHED`, `SEARCH_EXHAUSTED`, and `PAGE_CAP` end a cycle. A page cap is disclosed as a limited sample, not evidence that no other posts exist. `TIME_BUDGET`, `RATE_LIMIT`, `USAGE_LIMIT`, `UPSTREAM_ERROR`, and `CURSOR_INVALID` remain incomplete; valid checkpoints retain progress.
- The dashboard and collection-history API disclose coverage independently of the selected sentiment period. The detail view also exposes the most recent successful collection time.
- The ingestion CLI exits unsuccessfully on upstream failure even when the overall run preserves partial progress. Ordinary time-budget pauses and page caps do not signal upstream failure.
- `collect:coverage` previews missing models by default. Apply mode collects only missing models in bounded batches, stopping on an active lease, upstream failure, or its invocation limit. It can resume without resetting progress or recollecting the covered models.
- `COLLECTION_START_AT=2026-10-01T00:00:00Z` is set locally and added to the example deployment spec. X searches and buffered-post processing enforce this publication floor so cleanup is not undone by later collection. The X search lower bound also stays within its moving seven-day recent-search window.

The default batch size remains three and the shared budget remains 210 seconds. The deployment spec's four-hour schedule is unchanged. At three completed models per invocation, a 13-model pass needs five invocations: 16 hours between the first and fifth, or approximately 20 hours including an initial wait. The actual live scheduler still requires verification.

Coverage means a documented terminal collection outcome at the intended target. It does not guarantee 100 available posts or 100 dashboard-visible overall sentiment decisions. Classification questions, thresholds, and categories were not changed in this work.

## Publication-date cutoff

Use post publication time before `2026-10-01T00:00:00Z`, matching the application's UTC dates. Keep posts at or after that exact boundary. This was the cutoff used for the approved local cleanup.

Do not use mention creation time or analysis time. All 75 older mentions were reanalyzed in October, so filtering by analysis date would retain them. Their current analysis version is the same version used by the October evidence; removing them establishes a publication-date baseline, not a new classifier version.

The older evidence comprises 25 mentions each for archived GPT-5.6 Sol, archived Claude Opus, and enabled Kimi K3. Deleting it does not correct the missing collection coverage of the other models.

## Local cleanup execution

The preview was checked October 4 at 21:53:50 UTC. The deletion committed at 22:00:16 UTC (6:00 p.m. Eastern):

| Table | Before | Removed | After cleanup, before backfill |
| --- | ---: | ---: | ---: |
| XPost | 403 | 75 | 328 |
| ModelMention | 411 | 75 | 336 |
| MentionTopic | 1,644 | 300 | 1,344 |
| IngestionRun | 8 | 6 | 2 |
| IngestionModelResult | 28 | 12 | 16 |

Deleting old posts cascades to their model mentions and category decisions. Deleting collection runs whose `startedAt` is before the cutoff cascades to their per-model results. Old run history was included in the approved local cleanup and exported before deletion because it explains past failures and settings.

Preserve all model catalog and topic definitions. Preserve October runs, all October evidence regardless of analysis status, and the current rotation state. Archived models with no remaining mentions will disappear from the dashboard under its existing catalog selection rule, but their catalog records remain available.

## Local backups and change records

All raw data and credentials remain in Git-ignored `work/`:

- Full pre-change database snapshot: `work/data-cleanup/before-coverage-and-october-cleanup.dump` (PostgreSQL custom format, 165,981 bytes, mode 0600).
- Exact exported affected records: `work/data-cleanup/bc2df01c-e067-46b7-ae3b-1521e0936209.backup.json`.
- Committed cleanup counts and identity: `work/data-cleanup/bc2df01c-e067-46b7-ae3b-1521e0936209.result.json`.
- Backfill metrics: `work/data-cleanup/october-coverage.jsonl`.
- Per-model counts, timestamps, publication spans, and final local totals: `work/data-cleanup/october-coverage-summary.json`.
- Remaining-model collection log and final verification: `work/data-cleanup/remaining-models-collection.jsonl` and `work/data-cleanup/remaining-models-summary.json`.
- Before/after X credit balances: `work/data-cleanup/remaining-models-balance-before.json` and `work/data-cleanup/remaining-models-balance-after.json`.
- Unchanged-model baseline and final dashboard response: `work/data-cleanup/remaining-models-unmodified-baseline.json` and `work/data-cleanup/remaining-models-dashboard.json`.

The cleanup record identifies localhost / `codex_signalist`, the UTC cutoff, timestamp, and current Git HEAD. Implementation was still uncommitted at execution; that HEAD identifies the base revision, not a deployed release containing this fix. Record the committed release revision separately when production is changed. The full dump also predates the local role grants and coverage columns. Its table of contents was verified with `pg_restore --list`.

The coverage schema migration is `20261004020000_collection_coverage`. It adds nullable tracking columns and labels known historical terminal outcomes; it deletes no data. The migration SQL was applied locally using the existing table owner and marked applied in Prisma migration history. The generated client was updated, and the local Next.js process was restarted to use the local connection and new schema.

The cleanup command's apply mode acquires collection and reanalysis leases, locks the affected tables, writes a unique private export before deletion, then deletes and verifies in one transaction. A verification failure rolls deletion back. Catalog and topic definitions remain intact. A repeat preview found zero additional old records; after backfill there are still zero pre-October posts and no active job leases.

## Local collection outcome

Recorded October 4 at 22:06:37 UTC:

| Model | Accepted in target-100 cycle | Outcome |
| --- | ---: | --- |
| GPT-6 Astra | 100 | Target reached in original run |
| GPT-6.1 Sol | 100 | Target reached in original run |
| Kimi K3 | 100 | Target reached in original run |
| GPT-6 Luna | 100 | Target reached |
| Claude Fable 5.1 | 100 | Target reached |
| Claude Opus 5.5 | 100 | Target reached |
| Claude Sonnet 5.5 | 100 | Target reached |
| Claude Haiku 4.5 | 64 | Paused after a network fetch failure; checkpoint retained |
| Gemini 3.1 Pro | 100 | Target reached |
| Gemini 3.8 Flash | 100 | Target reached |
| DeepSeek V4.1 Flash | 100 | Target reached |
| DeepSeek V4 Pro | 0 | X HTTP 402, credits depleted; checkpoint retained |
| Grok 4.7 | — | Target-100 collection not started; original one-post sample retained |

The three backfill runs were `cmuud73e4000013qmj7g0p9xz`, `cmuud8tsp01h713qmfgfx83e5`, and `cmuudbh8s0000136bm0e879po`. Haiku's transport failure occurred fetching its next X page, after 64 accepted mentions. Host connectivity was checked and the bounded collection resumed for other missing models. The following batch reached two more targets before X returned `credits depleted (HTTP 402)`. Both blocked invocations exited with code 1 despite retaining useful partial progress.

Seven additional models reached 100, and Haiku added 64: 764 new accepted mentions in this backfill. Stored totals also include irrelevant and uncertain matches retained for audit. At this interruption, local totals were 1,076 posts, 1,127 model mentions, 4,508 category decisions, 5 runs, and 25 per-model results. The seven-day overall dashboard showed 1,021 classified mentions; visible opinion counts differ from accepted relevance counts.

The documented local resume commands were:

```sh
npm run collect:coverage -- --since 2026-10-01T00:00:00Z
npm run collect:coverage -- --since 2026-10-01T00:00:00Z --apply
```

At that interruption, the preview showed Haiku, DeepSeek V4 Pro, and Grok as missing. Apply retains valid checkpoints and skips covered models. No quota-failure retry loop was running. The default maximum is 30 bounded invocations; `--max-runs` can set another explicit limit up to 100. Use the rolling seven-day default for ongoing coverage rather than a fixed October date indefinitely.

### Remaining-model completion after funding

After the user added X funds and authorized collecting only the remaining models, local run `cmuufqu50000013ae02i8t1kp` completed on October 4 from 23:11:51.829 to 23:12:47.699 UTC, taking approximately 56 seconds. Collection was explicitly restricted to these three slugs; Haiku and DeepSeek reused their saved checkpoints.

| Model | Previously accepted | Newly accepted | Final cycle accepted | X posts fetched this run |
| --- | ---: | ---: | ---: | ---: |
| Claude Haiku 4.5 | 64 | 36 | 100 | 74 |
| DeepSeek V4 Pro | 0 | 100 | 100 | 152 |
| Grok 4.7 | 0 in a target-100 cycle | 100 | 100 | 199 |

All three recorded `COMPLETED` / `TARGET_REACHED`, adding 236 accepted mentions from 425 fetched candidate posts. The other ten enabled models' mention counts, ingestion-result counts, attempt timestamps, and checkpoints matched the saved baseline exactly. All 13 enabled models now have a target-100 outcome. Accepted relevance counts still differ from dashboard-visible classified opinion counts.

Verification at 23:13:52.429 UTC found 1,290 posts, 1,368 model mentions, 5,472 category decisions, 6 runs, and 28 per-model results; there were zero pre-October posts and zero active job leases. Local dashboard and health endpoints returned HTTP 200; the dashboard reported coverage of 13 evaluated models out of 13 enabled, with target 100.

The X account balance was $24.81 at 23:11:14.293 UTC before collection and $23.09 at 23:13:32.977 UTC afterward: an observed decrease of $1.72. This is an account balance comparison, not an itemized job invoice; concurrent account activity could affect it. Classifier charges are separate. Private logs and balance snapshots listed above preserve the evidence. No production collection or deployment was performed.

## Original production cleanup procedure

This was the proposed procedure before production data changes were authorized. The user subsequently chose a complete replacement with the local dataset, recorded below. The production cleanup commands in this section were not executed.

1. Verify the intended DigitalOcean account, app, managed database, collector command, target, batch size, four-hour schedule, and invocation logs. Current CLI access cannot see the deployed app, so the live scheduler has not been verified. A successful local backfill does not prove the live schedule works.
2. Arrange a quiet maintenance period for collectors and reanalysis. Set the app-level run-time variable `COLLECTION_START_AT=2026-10-01T00:00:00Z` before allowing new collection. Preserve all secret settings; do not copy the local development database URL to production.
3. Save a full managed-database backup using its native PostgreSQL connection settings, verify that the dump can be listed with `pg_restore --list`, and record the database identity and committed release revision. Keep backups private. The cleanup command's affected-row export complements this full backup.
4. Deploy the reviewed release. Its pre-deploy migration job runs `npm run db:deploy` and must apply `20261004020000_collection_coverage` before the new web and collector code starts. Do not run reset, development migrations, or destructive cleanup in startup.
5. In a shell configured with the **production** `DATABASE_URL`, run the preview below and review its exact affected counts. The script loads `.env` only for variables not already supplied; confirm the shell's connection destination. Apply only after production cleanup is authorized.

   ```sh
   npm run data:cleanup -- --before 2026-10-01T00:00:00Z --include-history
   npm run data:cleanup -- --before 2026-10-01T00:00:00Z --include-history --apply
   ```

   The post predicate is publication time strictly before the cutoff; the optional history predicate is run start time strictly before it. Omit `--include-history` if retaining older operational logs is preferred. Do not substitute local IDs or expected local counts.

6. Preserve the generated backup/result files in protected storage outside an ephemeral job container. Run preview again and verify zero affected records. Record actual deleted totals, timestamp, cutoff, database identity, and deployed release revision.
7. With X and Jev quota available, preview then apply initial missing-model coverage using the commands above. Record every cycle's target, cumulative accepted count, stop reason, and publication span. Exhaustion or page caps must remain distinguishable from reaching 100 and from blocked work.
8. Verify `/api/health`, the dashboard's collection column and coverage notice, model detail, and `/api/ingestion/history`. Resume the schedule and confirm the first real invocation and subsequent rotation from job logs and database results. Keep the existing PostHog configuration.

## Original implementation verification record

- 53 automated tests passed, including incomplete-model priority, one-post exclusion, resumed cumulative totals, failure signaling, cutoff validation, buffered-post cutoff enforcement, and existing rotation/checkpoint behavior.
- Typecheck and lint passed.
- Production build passed.
- Local health, dashboard, and history endpoints returned HTTP 200 after restarting the app.
- Initial browser verification showed 10/13 coverage, accepted counts, Haiku's upstream failure, DeepSeek's usage limit, and Grok's initial sample; incomplete evidence was explicitly labeled. After funding and the restricted completion run, the local dashboard API reported 13/13 coverage.
- No production migration, deletion, deployment, push, scheduler change, or classification change was performed.

## Authorized production data replacement

After confirming deployment, the user explicitly requested deleting live data and copying local data to production. The target matched the managed database in the saved DigitalOcean app configuration: `modelbanterdb`. The source remained `codex_signalist` on localhost; the local `.env` was not switched to production.

Preflight found that production still lacked `20261004020000_collection_coverage`, despite the reported deployment. After backups, `prisma migrate deploy` applied that missing migration. Production's original four migration records were preserved and verified, and the new migration checksum matched the committed SQL. Local and production column, constraint, index, and enum metadata matched before the data copy.

Connection attempts intermittently timed out. Fifteen idle app sessions with no open transaction were closed to make room for maintenance connections. Collector and reanalysis job leases were acquired on both databases; orphaned leases from failed connection attempts were cleared by their recorded owner IDs. Failed attempts did not delete application records.

Verified native PostgreSQL backups were saved privately before replacement:

- Directory: `work/production-replacement/20261005T022938Z-b10872c5/` (0700; files 0600, Git-ignored).
- `local-snapshot.dump`: 470,578 bytes; SHA-256 `46bffa525e3ddd34062fd35c435dfd2a6e292d2df4fb882a74491b0fa2651296`.
- `production-before.dump`: 166,431 bytes; SHA-256 `27402e8803b14946e48f3a580648ed7e3fa8dee1b1ef61edb935fe4b0721b837`.
- Both public-schema archives include schema and data; their table-of-contents lists were verified. They contain the temporary maintenance leases, identified by `leaseOwner` in `report.json`; release those leases if using a backup for recovery.

Replacement committed at **2026-10-05T02:30:28.113077Z** (October 4, 10:30 p.m. Eastern). One transaction locked and truncated the seven application tables, imported local rows in foreign-key order, and checked each table's count and canonical row-content hash before committing. Readers could not observe a committed empty dataset. Production migration history and operational lock state were handled separately from application data.

| Table | Production before | Production after, identical to local |
| --- | ---: | ---: |
| Model | 16 | 16 |
| Topic | 4 | 4 |
| XPost | 403 | 1,290 |
| ModelMention | 411 | 1,368 |
| MentionTopic | 1,644 | 5,472 |
| IngestionRun | 8 | 6 |
| IngestionModelResult | 28 | 28 |

A post-commit migration-history query initially failed because the restore tool left the persistent session's search path empty. No schema or migration records were lost. Fresh, explicitly qualified checks verified the original migration records, the added migration, and every copied application row. All maintenance leases were released; verification found zero active leases, zero pre-October posts, and all 13 enabled models reaching the target of 100.

The live health, dashboard, and collection-history endpoints returned HTTP 200. The dashboard reported `evaluated: 13`, `enabled: 13`, `target: 100`; collection history's latest run was `cmuufqu50000013ae02i8t1kp`, matching the local completion run. Private `report.json`, `verification-final.json`, `live-endpoint-verification.json`, API responses, migration log, and restore SQL preserve the execution evidence. The live scheduler was not changed or independently verified, and no X collection or classifier calls were made during the copy.
