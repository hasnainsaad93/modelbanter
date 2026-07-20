# Codex Signalist

Codex Signalist is a public LLM perception analytics platform. It uses the official X API v2 recent-search endpoint to collect model-related posts, classifies the sentiment and themes of every model mention independently, stores normalized results in PostgreSQL, and presents them through a responsive Next.js dashboard.

The application ships with clearly labeled demo data, so the complete interface works before an X bearer token or database is connected.

## Architecture

- **Presentation:** Next.js App Router, React Server Components where practical, focused client components for charts and filters, Tailwind CSS plus a product-specific design system, Motion, Recharts.
- **API:** Route handlers return a consistent `{ data, error }` envelope. Zod validates range, pagination, search, filter, and sort inputs.
- **Domain services:** model detection, deterministic sentiment, X query/search, ingestion, and analytics concerns live outside route handlers and React components.
- **Persistence:** PostgreSQL via Prisma. Global X posts and model associations are normalized with database uniqueness constraints.
- **Ingestion:** a reusable service is shared by a CLI command and a protected cron route. A database lease prevents overlapping runs. Each model paginates until it has 25 new associations, reaches a configured page cap, exhausts results, or encounters a terminal API condition.

## Stack

Next.js 16, React 19, TypeScript (strict), PostgreSQL, Prisma, Tailwind CSS 4, Motion, Recharts, Zod, Vitest, and the official X API v2.

## Local setup

Prerequisites: Node.js 22.13+, npm, and PostgreSQL 15+.

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Create the local database before migrating:

```sql
CREATE DATABASE codex_signalist;
```

Update `DATABASE_URL` in `.env` if your PostgreSQL username, password, host, or port differs from the example.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | For persistence | PostgreSQL connection used only on the server |
| `X_BEARER_TOKEN` | For live ingestion | Official X API v2 application bearer token |
| `CRON_SECRET` | Production | Protects `POST /api/cron/ingest` |
| `SENTIMENT_PROVIDER` | No | `local` is the deterministic default |
| `TARGET_UNIQUE_POSTS_PER_MODEL` | No | Defaults to 25 |
| `X_RESULTS_PER_PAGE` | No | Defaults to 100 |
| `X_MAX_PAGES_PER_MODEL` | No | Defaults to 10 |
| `INGESTION_INTERVAL_MINUTES` | No | Scheduler documentation/configuration value |
| `NEXT_PUBLIC_APP_NAME` | No | Public product name |
| `NEXT_PUBLIC_DEMO_MODE` | No | Displays the visible demo-data indicator |

Never prefix the X token, cron secret, or database URL with `NEXT_PUBLIC_`.

## X API configuration

Create a developer project in the X Developer Portal, create an application with read access, and place its bearer token in `X_BEARER_TOKEN`. The client calls `/2/tweets/search/recent`, requests author expansions, creation time, conversation metadata, and public metrics, limits results to English, and excludes reposts. It does not scrape X.

Recent search coverage and quotas depend on the X access tier. A 429 is stored as rate-limited progress; a usage-cap response is stored separately; authentication failures are not retried. Transient server errors use short exponential backoff.

## Running ingestion

Direct CLI:

```bash
npm run ingest
```

Cron endpoint:

```bash
curl -X POST http://localhost:3000/api/cron/ingest \
  -H "Authorization: Bearer $CRON_SECRET"
```

The endpoint may be secretless only when `NODE_ENV !== "production"` and no secret is configured. Production is always protected. `vercel.json` schedules the route at the start of each hour; any scheduler can invoke the same endpoint or import the host-independent `runIngestion` service.

### Deduplication and partial progress

`XPost.xPostId` is globally unique and `(ModelMention.postId, ModelMention.modelId)` is composite-unique. The ingestion service examines every result, skips existing associations, saves a new association even when the global post already exists, and continues through `next_token` pages until the per-model target is reached. Inserts use a transaction and `skipDuplicates`, making concurrent duplicates safe. Each completed page is committed, so a later rate limit does not erase earlier work.

## Sentiment and topics

`SentimentProvider` is replaceable. The included `LocalSentimentProvider` is deterministic, recognizes nearby negation, understands common AI/developer praise and complaints, extracts product topics, emits a normalized −1 to +1 score, and returns neutral for weak evidence. Every model in a multi-model post is analyzed separately. `analysisProvider` and `analysisVersion` allow future reprocessing.

The dashboard labels its primary perception score as unweighted. Engagement remains a separate signal so one viral post cannot dominate market sentiment.

## Adding a model

1. Insert a `Model` record with a unique slug, specific aliases, X search query, and display order.
2. Add the same entry to `lib/model-registry.ts` for the seed/demo and fallback registry.
3. Avoid ambiguous aliases unless the query and detector can require AI context.
4. Run ingestion. The generic pipeline needs no model-specific branch.

## Quality checks

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Tests mock X pages and never contact the real API. Coverage includes alias ambiguity, negation, multi-model analysis, post/association deduplication, duplicate-heavy pagination, target stopping, page caps, partial rate-limit progress, cron authorization, and analytics consistency.

## Deployment

Provision a PostgreSQL database, run `prisma migrate deploy`, seed only when demo content is wanted, configure server-side secrets, then deploy the Next.js application. Keep at least one application instance able to make outbound requests to `api.x.com`. The included Vercel cron configuration runs hourly; on another host, schedule the same authenticated POST.

The checked-in migration is the production source of truth; do not rely on `prisma db push` in production.

## Troubleshooting

- **Dashboard shows demo data:** expected until the persistence-backed analytics adapters are enabled and `NEXT_PUBLIC_DEMO_MODE=false`.
- **Prisma cannot connect:** verify PostgreSQL is running, the database exists, and `DATABASE_URL` includes the correct credentials.
- **401 from cron:** send the exact bearer value configured in `CRON_SECRET`.
- **X 401/403:** verify the bearer token and product access. Authentication failures are terminal for that run.
- **X 429:** partial inserts are preserved. Wait for the API reset before the next scheduled run.
- **No recent posts:** check the model's `searchQuery`; the run completes safely with zero new records.
