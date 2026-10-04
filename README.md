# ModelBanter

**The conversation around AI.**

Repository: [hasnainsaad93/modelbanter](https://github.com/hasnainsaad93/modelbanter). Public domain: [modelbanter.com](https://modelbanter.com). Domain registration is separate from deployment and DNS configuration.

A compact AI model sentiment dashboard. One overview combines a positive/negative trend with a model/category table. Model pages provide shareable drill-downs and original X posts. The app reads PostgreSQL; there is no demo-data fallback.

## Run locally

Requires Node.js 24 and PostgreSQL 15+.

For a fresh checkout, create the `modelbanter` PostgreSQL database before running migrations. Keep the existing database URL when upgrading an installation.

```sh
npm install
cp .env.example .env # only for a new checkout; preserve existing credentials
npm run db:generate
npx prisma migrate deploy
npm run catalog:sync
npm run dev
```

The catalog command adds missing models and preserves existing model settings. It archives the original ambiguous `fable`/`claude-opus` records and the older `gpt-5-6-sol` collector without deleting their evidence. The 13-model initial selection is curated, not an objective ranking. All runtime model names, aliases, queries and enabled flags come from PostgreSQL. Add a Model record to expand coverage; UI changes are unnecessary. `db:seed` only creates catalog records, not synthetic posts.

Catalog sources checked October 4, 2026:
- OpenAI: https://developers.openai.com/api/docs/models
- Anthropic: https://platform.claude.com/docs/en/models/overview
- Google: https://ai.google.dev/gemini-api/docs/models
- Moonshot AI: https://github.com/MoonshotAI/Kimi-K3
- DeepSeek: https://api-docs.deepseek.com/quick_start/pricing
- xAI: https://docs.x.ai/developers/models

## DigitalOcean managed database

The deployed installation uses the managed PostgreSQL database `modelbanterdb`. Its schema, data, and Prisma migration history were copied from the original local database. Local development currently uses `codex_signalist` on localhost. Every collection, analysis, and maintenance command writes to the database selected by its `DATABASE_URL`; check that destination before running it. Credentials and migration backups remain outside Git.

For App Platform, set `DATABASE_URL` as a secret environment variable using the database's connection URL, selecting `modelbanterdb` and retaining `sslmode=require` (and `schema=public`). The local `.env` is not uploaded with the repository. Run `npx prisma migrate deploy` against this connection for subsequent schema updates; do not use `migrate dev` or `migrate reset` against the managed database. The health endpoint `/api/health` checks connectivity.

## DigitalOcean App Platform deployment

Create the app in the account that owns the database. Connect the GitHub repository `hasnainsaad93/modelbanter`, select `main`, and enable Autodeploy for its components. The example spec [.do/app.json](.do/app.json) defines the web service and two jobs. Its secret fields are intentionally blank; configure them privately in App Platform. The Node 24 buildpack installs dependencies and prunes development packages. `tsx` is a production dependency because the collection job runs TypeScript.

| Component | Type / trigger | Build command | Run command |
| --- | --- | --- | --- |
| `web` | Web service | `npm run build` | `npm run start -- --hostname 0.0.0.0 --port 8080` |
| `migrate` | Job, before every deploy | `npm run db:generate` | `npm run db:deploy` |
| `collect` | Job, on a schedule | `npm run db:generate` | `npm run ingest` |

Set the web service's HTTP port to `8080` and health-check path to `/api/health`. Allow a 20-second startup delay and 10-second health-check timeout. Start with one shared 1 GB instance for web and shared 512 MB job instances. Choose a region near the managed database. No new database or continuously running worker is needed.

Set collection's schedule to `0 */4 * * *`, timezone `Etc/UTC`: 00:00, 04:00, 08:00, 12:00, 16:00, and 20:00 UTC. It runs `npm run ingest` directly, so no external HTTP scheduler is required. The existing database lease and durable checkpoints still protect against overlap and interrupted runs. Collection exits after disconnecting its database client; failed, rate-limited, and quota-exhausted runs signal failure to App Platform. Partial runs retain their checkpoints for later rotation. X and TypeSafe quota costs still apply.

Configure these app-level environment variables so all three components inherit them:

| Variables | Scope | Handling |
| --- | --- | --- |
| `DATABASE_URL`, `CRON_SECRET`, `X_BEARER_TOKEN`, `TYPESAFE_JEV` | Run time | Encrypt; copy from the local `.env` |
| `NODE_ENV=production` | Build and run time | Plain text |
| `NEXT_PUBLIC_SITE_URL=https://modelbanter.com`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | Build and run time | Plain text; the PostHog project token is public |
| `SENTIMENT_PROVIDER=typesafe`, `TARGET_UNIQUE_POSTS_PER_MODEL=100`, `MODELS_PER_RUN=3`, `X_MAX_PAGES_PER_MODEL=20`, `X_RESULTS_PER_PAGE=100`, `COLLECTION_START_AT=2026-10-01T00:00:00Z` | Run time | Plain text |

For the deployed `DATABASE_URL`, keep `sslmode=require`, add `connect_timeout=20` and `connection_limit=5`, and select `/modelbanterdb`. If the managed database restricts trusted sources, add the app through the database's DigitalOcean settings. Credentials remain in private environment settings, not GitHub. `npm run deploy:prepare` optionally produces a private, Git-ignored spec at `work/digitalocean/app.secret.json` from `.env`; it does not access DigitalOcean or deploy anything. This file contains secrets and must never be committed.

The migration job must succeed before web is released. It preserves existing data and only applies unapplied migrations. Do not run `db:seed`, `migrate dev`, or a database reset during deployment. If migrations cannot connect, correct database connectivity instead of disabling the migration job.

After deployment, verify `/api/health`, overview and model pages, and the Job activity/logs for `collect`. PostHog tracking activates on the public hostname. Add `modelbanter.com` as a custom domain and use the DNS records DigitalOcean supplies in GoDaddy; DigitalOcean provisions the HTTPS certificate once DNS is verified. `vercel.json` is only for Vercel and has no effect on this deployment.

Platform references: [scheduled and deployment jobs](https://docs.digitalocean.com/products/app-platform/how-to/manage-jobs/), [Node buildpack behavior](https://docs.digitalocean.com/products/app-platform/reference/buildpacks/nodejs/), and [app specification](https://docs.digitalocean.com/products/app-platform/reference/app-spec/).

## Classification and collection

Set `TYPESAFE_JEV` (or `TYPESAFE_API_KEY`) to the TypeSafe API credential, and use `SENTIMENT_PROVIDER=typesafe`. The server calls https://api.typesafe.ai/v1/systemone with six independent Choice questions per post/model pair: relevance, overall, reasoning, speed, cost, and code quality. The target model appears explicitly in every question. Original post text is evidence, never instructions.

Each category stores positive, negative, neutral, mixed, or not-discussed, plus confidence and the probability distribution. The actual Jev model version and our question version are recorded. Token counters accumulate successful saved responses, not a billing ledger (failed or unsaved requests may still be billable).

```sh
npm run ingest
npm run analyze:pending
# Reprocess results from older question versions:
npm run analyze:pending -- --refresh
# Small bounded collection for checking credentials and the pipeline:
TARGET_UNIQUE_POSTS_PER_MODEL=1 X_RESULTS_PER_PAGE=10 X_MAX_PAGES_PER_MODEL=1 npm run ingest
```

These commands use real API quota. `REANALYZE_LIMIT` caps each analysis batch (default 100, maximum 1000). A separate live regression check with four synthetic examples is available via `npm run test:jev:live`; it is intentionally excluded from normal tests.

Raw posts and pending mentions are saved before Jev is called. Failed analyses are retained and retried using `analyze:pending` or when their buffered collection resumes; no neutral result is fabricated on failure. Low-confidence relevance becomes UNCERTAIN, irrelevant matches become REJECTED, and successful decisions become COMPLETED. Legacy keyword results are excluded until reanalyzed. Duplicate post IDs and model associations are unique. Database leases prevent overlapping jobs, and a bounded collection run preserves partial progress on time limits or upstream quota errors. A scheduler must invoke the collection CLI or route; running the local app does not schedule jobs.

Collection defaults to `MODELS_PER_RUN=3`, `TARGET_UNIQUE_POSTS_PER_MODEL=100`, `X_MAX_PAGES_PER_MODEL=20`, and `X_RESULTS_PER_PAGE=100`. Each run prioritizes models without a terminal collection outcome at the configured target in the last seven days, then sorts by oldest attempt within each group. A one-post credential check does not count as full collection coverage. Attempts are timestamped individually, not when a batch is merely selected. Approximately five successful batches cover 13 models, but reaching all targets may require further rotations.

The dashboard reports collection coverage separately from sentiment counts, including cumulative accepted progress, latest attempt, and stop reason. Targets reached, exhausted searches, and page limits are terminal outcomes; time budgets and upstream failures remain incomplete. CLI jobs signal upstream failures even after useful partial progress. Accepted relevance decisions can still lack a confident overall sentiment, so 100 accepted mentions does not promise 100 visible overall opinions.

For an initial pass across missing models, preview before applying:

```sh
npm run collect:coverage -- --since 2026-10-01T00:00:00Z
npm run collect:coverage -- --since 2026-10-01T00:00:00Z --apply
```

This command runs bounded batches until each enabled model has a terminal outcome, stops on upstream failure or an active collector, and defaults to at most 30 invocations. Resuming preserves checkpoints and skips covered models. Without `--since`, it evaluates the last seven days. Apply mode consumes real API quota. `COLLECTION_START_AT` is an optional UTC publication-date floor, enforced in X searches and buffered-post processing; it prevents deleted older evidence from being collected again.

Date cleanup is a separate manual command, never an automatic migration or startup task:

```sh
npm run data:cleanup -- --before 2026-10-01T00:00:00Z --include-history
npm run data:cleanup -- --before 2026-10-01T00:00:00Z --include-history --apply
```

Preview performs no deletion. Apply acquires job leases, exports affected records privately, and deletes them transactionally with count and catalog checks. `--include-history` also removes older collection runs; omit it to preserve those logs. The full execution record and production procedure are in [the coverage and cleanup runbook](docs/collection-coverage-and-october-cleanup.md).

Each model has a durable collection checkpoint: fixed search end time, next-page cursor, fetched-but-unprocessed posts and authors, pages fetched, and cycle ID. The 100-post target and 20-page cap apply to the complete collection cycle across resumes. Accepted counts are recovered from committed model mentions tagged with that cycle, avoiding double analysis after an interrupted checkpoint write. Finished targets, exhausted searches and page caps close the cycle; a later rotation starts a fresh search. Time and service failures retain the unfinished cycle. Changed search/settings, checkpoints older than six days, or rejected API cursors start fresh; stored evidence remains intact. A completed search can have fewer than 100 available matches. X's [recent-search API](https://docs.x.com/x-api/posts/search-recent-posts) supplies the time boundary and pagination cursor.

`GET` and `POST /api/cron/ingest` accept the same exact `Authorization: Bearer <CRON_SECRET>` value. A secret is always required in production. `vercel.json` schedules the GET endpoint hourly on Vercel. Before deployment, choose a Vercel plan with the required scheduling frequency and function duration. Each run stops starting work after 210 seconds; the route allows up to 300 seconds for cleanup. The older Cloudflare/Sites build configuration is retained, but this implementation is verified on the Node/Next.js path with PostgreSQL.

## What the numbers mean

- Every record is a model mention; one X post can contribute to multiple models.
- Positive and negative percentages divide by all included opinions, including neutral and mixed. Not-discussed is excluded.
- Only COMPLETED, relevant Jev results with confidence at least 0.3 are counted. This is an initial uncertainty threshold, not a measured accuracy guarantee.
- Category views use that category's decision and confidence, independently of overall sentiment.
- A sample below five mentions is labeled small. Changes compare net sentiment against the immediately preceding equal-duration period, only if both have at least five mentions. All-time has no previous-period comparison.
- Dates are UTC; finite windows are relative to now. All-time charts span available evidence. Empty buckets remain gaps, never zero sentiment.
- Collection is capped and searches English-language non-reposts. Counts describe the collected sample, not total model popularity on X.
- Historical/archived models and latest post dates remain visible. A database failure returns an explicit error, never demo data.

## PostHog

Set `NEXT_PUBLIC_POSTHOG_KEY` to the **public project token** and `NEXT_PUBLIC_POSTHOG_HOST` to your project's ingestion host (`https://us.i.posthog.com` or `https://eu.i.posthog.com`). `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` is also accepted. Rebuild after changing public variables. Never put a personal API key in a NEXT_PUBLIC variable.

Tracking runs only in production on a non-local hostname. Development and localhost are excluded even under `next start`. Anonymous cookieless collection is enabled, person profiles are disabled, and session replay, heatmaps, surveys and automatic click capture are disabled. Confirm cookieless event processing is enabled for the project in PostHog. URLs are stripped of query strings/hashes; original post text and free text are never attached to events.

To exclude your own browser, run this once in that site's browser console and reload:

```js
localStorage.setItem("modelbanter.analytics.disabled", "true")
```

Events:

| Event | Properties |
| --- | --- |
| `$pageview` | Clean route |
| `model_opened` | model, category, range |
| `category_selected` | model, category, range |
| `filter_changed` | filter, model, vendor, category, range, sentiment |
| `source_post_opened` | model, category, sentiment |

Pageviews count route changes, not filter-only query changes. Filter actions emit their own event. Suggested private dashboard: daily visitors, referrers, most opened models, most selected categories, and a funnel from pageview → model_opened → source_post_opened. For category links that directly open a model, use the corresponding model pageview when defining the funnel. Anonymous/cookieless visitors are estimates, not cross-device identities. Set the project billing limit to zero if you want to stay within the free allowance.

## Routes and checks

Public pages: `/` and `/models/[slug]`. Filters are shareable query parameters: `range=24h|7d|30d|all`, `vendor`, `model`, `category=all|reasoning|speed|cost|code_quality`, `sentiment=all|POSITIVE|NEGATIVE|NEUTRAL|MIXED`, `page`. The old `/compare`, `/posts` and `/methodology` addresses redirect into this flow.

Read APIs: `/api/dashboard`, `/api/models`, `/api/models/[slug]`, `/api/posts`, `/api/ingestion/history`, `/api/health`. Responses use `{data,error}` and query inputs are validated. `/api/health` checks the database connection.

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Tests cover provider response validation and errors, per-model questions, category/date aggregation, missing/uncertain decisions, collection deduplication, rotation fairness, checkpoint/page-cap recovery, preserved failures, time budgets, cron authentication, and analytics exclusions. These are functional tests, not a sentiment accuracy benchmark. Evaluate a larger hand-labeled sample before making accuracy claims.

Before publishing, set `NEXT_PUBLIC_SITE_URL`, configure production credentials and migrations, and verify PostHog event arrival on the production hostname. No API keys are sent to the browser except PostHog's public project token.
