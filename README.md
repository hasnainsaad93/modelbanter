# ModelBanter

**The conversation around AI.**

Repository: [hasnainsaad93/modelbanter](https://github.com/hasnainsaad93/modelbanter). Public domain: [modelbanter.com](https://modelbanter.com). Domain registration is separate from deployment and DNS configuration.

A compact AI model sentiment dashboard. One overview combines a positive/negative trend with a model/category table. Model pages provide shareable drill-downs and original X posts. The app reads PostgreSQL; there is no demo-data fallback.

## Run locally

Requires Node.js 22.13+ and PostgreSQL 15+.

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

Raw posts and pending mentions are saved before Jev is called. Failed analyses are retained and retried using `analyze:pending` or when their buffered collection resumes; no neutral result is fabricated on failure. Low-confidence relevance becomes UNCERTAIN, irrelevant matches become REJECTED, and successful decisions become COMPLETED. Legacy keyword results are excluded until reanalyzed. Duplicate post IDs and model associations are unique. Database leases prevent overlapping jobs, and a bounded collection run preserves partial progress on time limits or upstream quota errors. An external scheduler must invoke the collection route; running the local app does not schedule jobs.

Collection now defaults to `MODELS_PER_RUN=3`, `TARGET_UNIQUE_POSTS_PER_MODEL=100`, `X_MAX_PAGES_PER_MODEL=20`, and `X_RESULTS_PER_PAGE=100`. Each run chooses up to three enabled models with the oldest attempt times; models that never started retain their place. Attempts are timestamped individually, not when a batch is merely selected. Approximately five successful batches cover 13 models, but reaching all targets may require further rotations.

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
