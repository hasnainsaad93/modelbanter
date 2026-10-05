# Phase 4: classification history and controlled rollout

The workflow now separates paid analysis from changing the dashboard. A batch fixes its inputs and classifier, stores candidates for review, and applies only when explicitly requested. Every saved classification records its previous and new values in the same database transaction.

## State of this implementation

The code and migrations were tested against a disposable local copy of the database. The main local database and production have not been migrated, deployed, or reclassified by this work. Existing production collection continues on its deployed code.

A fresh development sample contains 26 posts, two for each of 13 enabled models, including 13 reference-bearing posts. It excludes earlier evaluation posts, normalized texts, and conversations. Selection uses a fixed hash order within each model, choosing a reply/quote and a standalone post where available. This is a small model-balanced review sample, not a prevalence or accuracy benchmark.

All 26 candidates completed with remote X fetching disabled. Stored references supplied five context entries; nine additional references remained unavailable locally. Eleven mentions would change at least one decision. Six decisions across five posts differed from assistant draft labels fixed before seeing the candidate results:

- Claude Sonnet 5.5: coding praise inferred from a subagent/Claude Code recommendation.
- Claude Haiku 4.5: “below list price” treated as positive instead of factual pricing.
- Gemini 3.1 Pro: a routing/hallucination complaint classified as negative reasoning.
- Gemini 3.1 Pro: a factual pricing comparison classified as negative overall and cost.
- DeepSeek V4.1 Flash: a proposal about free-access limits treated as cost not discussed.

These disagreements need review; draft labels are not verified ground truth. The prompt was not tuned on this sample. Several other ambiguous judgments were deliberately left unjudged. The private review is `work/jev-phase4/review/review.html`; draft labels and validation details are beside it in `work/jev-phase4/`.

Applying and rolling back all 26 was exercised **only in the disposable database**, producing 52 history revisions. The candidate records remain for inspection. Actual API use was 26 Jev analyses, 138,620 reported input tokens and 10,876 output tokens, with zero X API calls. Successful recorded usage is not an invoice and cannot account for unreported failed requests.

## Schema and guarantees

Migration: `prisma/migrations/20261005020000_analysis_history/migration.sql`, applied after the Phase 3 context migration.

| Addition | Purpose |
| --- | --- |
| `ModelMention.analysisRevision` | Monotonic revision for concurrency checks; existing records start at zero |
| `AnalysisRevision` | Before/after snapshots, revision number, operation key, source, and timestamp |
| `ReanalysisBatch` | Fixed selection, target version, pinned classifier, rule fingerprint, and context-fetch policy |
| `ReanalysisItem` | Original input and classification, candidate, state, attempts, and errors |

The first replacement preserves the existing classification as its before snapshot. New ingestion also records history, beginning with its pending state. History does not reconstruct changes made before this feature existed. No legacy labels are rewritten by the migration.

Applying a candidate checks the root post, target-model metadata, original classification snapshot, and revision number. Stale candidates become `CONFLICT` rather than overwriting newer work. Shared category display names are recorded for history but excluded from conflict checks, so renaming Code quality to Coding does not invalidate other pending items. Row locks and unique operation keys make retries idempotent. Candidate application, topic updates, history insertion, and item status changes commit together. If any part fails, all of those changes roll back.

Rollback appends a compensating revision and restores the previous classification only if no later classification has replaced it. It restores category values and the original analysis time/version/status; it retains cumulative token counters, revision progress, and globally shared category display names. It never refunds API usage or erases history. A rolled-back item cannot be reapplied; prepare a fresh batch.

History and batch items follow their model mention's lifecycle and are cascade-deleted if that mention is explicitly deleted. Backups remain necessary for recovery after deletion. The history is not an external immutable audit ledger.

## CLI process

All commands use the selected `DATABASE_URL`. Preview confirms the selected IDs and target version; it makes no writes or API calls. Check the database destination outside shared logs—never print the credential-bearing URL.

```sh
# 1. Preview older classifications, bounded to 20 mentions.
npm run analyze:pending -- --refresh --limit 20

# 2. Create the fixed batch. This writes batch metadata only and prints a batch ID.
npm run analyze:pending -- --refresh --limit 20 --create

# 3. Run paid Jev analyses into candidate storage. Existing labels stay active.
npm run analyze:pending -- --run <batch-id>

# 4. Recreate the HTML/JSON review without paid calls.
npm run analyze:pending -- --report <batch-id>

# 5. After review, apply all candidates or a selected subset of mention IDs.
npm run analyze:pending -- --apply <batch-id>
npm run analyze:pending -- --apply <batch-id> --only <mention-id>,<mention-id>

# 6. If needed, restore the prior labels without API calls.
npm run analyze:pending -- --rollback <batch-id>
```

Omit `--refresh` to select `PENDING`, `FAILED`, or `LEGACY` records. Refresh selects records whose full stored rule/classifier version differs from the configured target. `--model <slug>`, `--since <ISO-UTC-time>`, and `--mention-ids <ids>` narrow a preview or creation. Selection defaults to 20 and is limited to 100 mentions, controlled by `--limit` or `REANALYZE_LIMIT`. Selection/context flags cannot change an existing batch.

Creation defaults to stored/cache-only context. Add `--fetch-context` at creation to permit one-hop X lookups under the shared daily Phase 3 cap. With that flag, each mention may make a second Jev analysis after new context arrives. Existing transport retries still apply; limits count logical analyses, not HTTP attempts. Preview's X maximum is before caching, selectivity, and the shared budget cap.

Running stops after the first error or after four minutes of starting work. Resume with the same `--run` command to process remaining pending items; saved candidates are not analyzed again. A ten-minute batch lease prevents concurrent workers. Interrupted attempts are marked failed because their paid outcome may be unknown. Only `--run <id> --retry-failed` retries failed items, with at most two logical attempts per item in that batch. Creating a new batch is a new spending decision; this is not a global Jev account spending cap.

Reports are written privately under `work/reclassification/<batch-id>/` by default; `--out <directory>` changes the destination. `--references <json-file>` optionally adds draft-check labels to the report using `{ "cases": [{ "mentionId": "...", "expected": { "overall": "POSITIVE", "cost": null } }] }`. It does not approve or alter candidates. Unresolved failures/conflicts produce a nonzero CLI exit code. A partially processed batch remains resumable; inspect its status counts rather than assuming all items are finished.

## Dashboard and debugging

Public views accept `analysis=all|current`. All saved results remain the default; “Latest rules only” restricts to the current rule version. Public sentiment counts and source-post listings use the same filter. Collection coverage remains independent of analysis versions.

Period-change figures are suppressed when the included current/prior records have different full rule/classifier versions. A visible notice explains the mixed methods. This reduces misleading comparisons during gradual reprocessing, but the resulting sample may still be uneven; it is not a matched longitudinal study.

`GET /api/debug/jev/history?postId=<X-ID>&modelSlug=<slug>` uses the existing CRON_SECRET authorization policy and returns before/after history, latest version/revision, and up to 20 entries. Supply `beforeRevision=<nextBeforeRevision>` to read older entries. It makes no paid calls or writes and sends `Cache-Control: no-store`.

## Production sequence

1. Review the fresh sample, especially the five flagged posts, before a broad backfill. Approve only the candidates judged useful; uncertainty and disagreements should remain visible.
2. Back up production and deploy the reviewed code with both additive migrations. The DigitalOcean spec already has a pre-deploy migration job. Verify the web and scheduled worker revisions, and preserve the chosen collection settings.
3. Initially keep reanalysis X context fetching off. Optionally set `X_CONTEXT_MAX_POSTS_PER_DAY=0` during rollout to disable new ingestion context fetches too; stored/cache context still works.
4. Prepare a new small production batch. Local batch IDs and candidate rows live only in the disposable database; do not copy or overwrite production with that database.
5. Run, review, and apply a small subset. Inspect history, status counts, candidate token usage, and public counts under both analysis filters.
6. Continue reviewed batches gradually. Stop on provider failures or unexpected label changes. Use rollback only while the applied revision is still the latest one.

Code and schema validation do not establish classifier accuracy. Production deployment and broad reclassification remain pending the sample review and rollout execution; they are not implied by a passing build.
