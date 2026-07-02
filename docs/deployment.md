# Deployment

Current deployment has two independently deployed parts:

- `email-worker/`: Cloudflare Worker that consumes Cloudflare Queue messages and sends email.
- `event-proxy/`: commercetools Connect event application that receives Commerce Notifications and publishes Email Events to the Cloudflare Queue.

Deploy the Worker first, then the Event Proxy.

## Prerequisites

- Node.js 20 or newer.
- `wrangler` access to the target Cloudflare account.
- Cloudflare Email Sending configured for the sender domain.
- commercetools CLI access for staging, publishing, and creating or updating Connect deployments.
- A git tag for the connector version because `event-proxy/scripts/deploy.mjs` stages from the latest tag.

## Cloudflare Setup

Create the queue, dead-letter queue, and KV namespace:

```bash
cd email-worker
npx wrangler queues create commerce-notifications-email-dev
npx wrangler queues create email-events-dlq
npx wrangler kv namespace create EMAIL_DEDUPE
```

For production, use production names such as `commerce-notifications-email` and a separate production KV namespace.

Copy the example Worker config and fill in Cloudflare resource IDs:

```bash
cp wrangler.example.toml wrangler.toml
```

Configure these values in `wrangler.toml`:

- `[[queues.consumers]].queue`: Cloudflare Queue name, for example `commerce-notifications-email-dev`.
- `[[queues.consumers]].dead_letter_queue`: DLQ name, for example `email-events-dlq`.
- `[[kv_namespaces]].id`: KV namespace ID from `wrangler kv namespace create EMAIL_DEDUPE`.
- `[[durable_objects]]` (`STATS` → `StatsDurableObject`) and the `[[migrations]] new_sqlite_classes` entry: the atomic counters backing `/stats`.
- A second `[[queues.consumers]]` for `email-events-dlq` and the `[[queues.producers]]` (`EMAIL_QUEUE`) binding: required for DLQ consumption and `/admin/replay-dlq`.
- `DLQ_QUEUE_NAME`, `DLQ_REPLAY_TTL_SECONDS`: DLQ routing and replay-backup TTL.
- `FROM_EMAIL`, `STORE_URL`, `EMAIL_SENDING_ENABLED`: sender address, storefront URL, and the send enable flag (keep `false` until templates and recipients are safe to test).

There are three Worker configs; keep their binding set in sync when adding or removing a binding, or the feature will silently no-op in one environment:

- `wrangler.toml` — the live, per-environment config. **Gitignored** (`wrangler.toml*`); never committed.
- `wrangler.example.toml` — tracked template operators copy from.
- `wrangler.e2e.toml` — tracked, minimal local config used by `npm run test:e2e` (no secrets or remote bindings).

Production secrets should not live in `wrangler.toml`. Set them with Wrangler:

```bash
npx wrangler secret put ORDER_LINK_SECRET
```

The Worker also needs this binding for Cloudflare Email Sending:

```toml
[[send_email]]
name = "EMAIL"
remote = true
```

Deploy the Worker:

```bash
npm install
npm run build
npm test
npm run deploy
```

## Cloudflare Queue Publisher Credentials

The Event Proxy publishes with the Cloudflare Queue HTTP API. Create an API token with permission to push messages to the target queue. Then provide the publisher config to the Event Proxy in one of two ways.

Full JSON:

```dotenv
OUTBOUND_PUBLISHER_CONFIG={"type":"cloudflare-queue","accountId":"<account-id>","queueId":"<queue-id>","apiToken":"<api-token>"}
```

Deploy-script shorthand:

```dotenv
CF_ACCOUNT_ID=<account-id>
CF_QUEUE_ID=<queue-id>
CF_QUEUE_API_TOKEN=<api-token>
```

Use the Cloudflare account ID, the target Queue ID, and an API token with queue edit/push access. The Worker consumer binding uses the queue name; the HTTP publisher config uses the queue ID.

## Event Proxy Setup

Create `event-proxy/.env` from `event-proxy/.env.example` and fill in:

- `CTP_CLIENT_ID`, `CTP_CLIENT_SECRET`, `CTP_PROJECT_KEY`, and `CTP_REGION` or `CTP_AUTH_URL` for the deploy script.
- `OUTBOUND_PUBLISHER_CONFIG`, or the `CF_*` shorthand variables above.
- `CT_MESSAGE_TYPES=OrderCreated,CustomerEmailTokenCreated,CustomerPasswordTokenCreated` for the currently handled Worker workflows.
- `DRY_RUN_FORWARDING=false` when publishing to Cloudflare Queue.
- `DEV_INSPECTION_ENABLED=false` for production.

Deploy or preview the Connect deployment:

```bash
cd event-proxy
npm install
npm run build
npm test
npm run deploy -- --dry-run
npm run deploy
```

The deploy script reads `.env`, stages from the latest git tag, publishes the connector, then tries to update an existing deployment or create a new one. It base64-encodes comma-containing config values with a `b64:` prefix because the commercetools CLI splits `--configuration` values on commas. The app decodes these values at startup.

If deployment create/update fails with an access error, use the dry-run output to create or update the deployment manually in Merchant Center Connect, or grant the CLI API client the required Connect deployment management scopes.

## commercetools Subscription

`connect.yaml` declares an event application at `POST /event-proxy`. Its `postDeploy` hook runs `connector:post-deploy`, which creates or updates the commercetools Subscription identified by `CT_SUBSCRIPTION_KEY`.

The Connect runtime provides these variables to the hook:

- `CONNECT_SUBSCRIPTION_DESTINATION`
- `CONNECT_GCP_PROJECT_ID`
- `CONNECT_GCP_TOPIC_NAME`
- `CONNECT_AWS_TOPIC_ARN`

The connector inherits a commercetools API client with `manage_subscriptions` and `manage_customers`. `manage_customers` is required for Proxy Enrichment of token Commerce Notifications.

## Observability and Alerting

### Email Worker counters (`/stats`)

Counters live in a single Durable Object (`STATS`) so every increment serializes through one instance. Read exact, synchronous totals at any time:

```bash
curl https://<worker-host>/stats
```

Fields: `processed`, `ignored`, `duplicate`, `disabled`, `emailsSent`, `errors`, `dlq`. Alert on a sustained non-zero `errors` rate and on any `dlq` increase. Durable Objects with SQLite storage are available on both the Workers Free and Paid plans.

### Dead-letter queue

Messages that exhaust `max_retries` on the main consumer land in `email-events-dlq`, which the Worker also consumes. Each dead-lettered message is:

1. logged at **error** level as `email-worker dead-letter message received` (the primary alert signal — configure a Cloudflare Workers Logs alert on that message);
2. counted in the atomic `dlq` counter (visible in `/stats`);
3. optionally pushed to `ALERT_WEBHOOK_URL` for teams without log-based alerting;
4. backed up in KV (`dlq:<queueMessageId>`) for replay, then acknowledged so the DLQ cannot grow unbounded.

### Outbound publisher failures (Event Proxy)

With multiple Outbound Publishers, the Composite Publisher acknowledges commercetools as soon as any single publisher succeeds (ADR 0004). A degraded publisher therefore does **not** trigger commercetools redelivery, so its failures must be caught by log alerting, not by redelivery counts. Alert when the rate of these Event Proxy log lines is sustained above zero:

- `outbound publisher failed` — one publisher rejected a Commerce Notification; carries `publisherIndex` (its position in `OUTBOUND_PUBLISHER_CONFIG`).
- `commerce notification partially forwarded` — the notification was delivered through another publisher, but at least one publisher failed.
- `all N outbound publishers failed` / HTTP `503` to commercetools — nothing was delivered; commercetools will redeliver.

## Dead-Letter Queue Replay

Backed-up dead-lettered messages survive in KV for `DLQ_REPLAY_TTL_SECONDS` (default 30 days). Inspect and replay them once the root cause is fixed:

```bash
# List the current backlog (auth with ADMIN_TOKEN)
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://<worker-host>/admin/dlq

# Re-enqueue backed-up messages onto the main queue. Each call processes a
# bounded batch (200) so a large backlog drains over several calls; re-POST
# while the response reports "remaining": true.
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://<worker-host>/admin/replay-dlq
# -> {"replayed": N, "failed": M, "remaining": <bool>}

Replayed messages re-enter normal handling, and a message that fails again for the same reason returns to the DLQ. Records that fail to re-enqueue are retained for a later retry. Note that deduplication does **not** make replay idempotent: a message only reaches the DLQ after its send repeatedly failed, and the dedupe key is written only after a *successful* send — so a dead-lettered message has no dedupe key and replay always re-sends. Run replay only once the root cause is fixed. Set `ADMIN_TOKEN` as a Wrangler secret in production; the `/admin/*` endpoints return 404 while it is unset.

## Smoke Test

1. Keep `EMAIL_SENDING_ENABLED=false` for the first queue delivery test.
2. Deploy the Worker.
3. Deploy the Event Proxy with `DRY_RUN_FORWARDING=false`.
4. Trigger an `OrderCreated`, `CustomerEmailTokenCreated`, `CustomerPasswordTokenCreated`, or successful Payment transaction Commerce Notification in the commercetools project.
5. Check Worker logs for `email-worker processing message`.
6. Enable email sending only after queue delivery, deduplication, sender domain, and template output are verified.

## Local Dry Run

For local proxy inspection without publishing to Cloudflare:

```bash
cd event-proxy
OUTBOUND_PUBLISHER_CONFIG='{"type":"cloudflare-queue","accountId":"local","queueId":"local","apiToken":"local"}' \
DRY_RUN_FORWARDING=true \
DEV_INSPECTION_ENABLED=true \
DEV_INSPECTION_TOKEN=change-me-inspection-token \
npm run dev
```

Inspect captured Commerce Notifications with the bearer token:

```bash
curl -H 'Authorization: Bearer change-me-inspection-token' \
  http://localhost:8080/event-proxy/dev/messages
```

## Testing

The email worker has two test surfaces:

- `npm test` — Vitest unit tests under Node. They instantiate the stats Durable Object through a `cloudflare:workers` shim (`test/cloudflare-workers-shim.ts`), so they exercise the counter logic but **cannot** catch RPC/binding regressions.
- `npm run test:e2e` — Vitest under `@cloudflare/vitest-pool-workers` (Miniflare) against the local `wrangler.e2e.toml`. This is the guard that fails if the DO class stops extending `DurableObject` or a binding is missing; it runs with no Cloudflare credentials.

In CI, `connect-validate.yml` runs the unit tests in the `validate-connect-app` job and the e2e in a separate `email-worker-e2e` job (so a workerd hiccup cannot block Connect validation).

## Security Scanning

The `Connect validation` workflow (`.github/workflows/connect-validate.yml`) runs `npm audit --audit-level=high --omit=dev` for both packages on every push and pull request — auditing **runtime** dependencies only, so a dev-only advisory cannot block releases. A high or critical runtime advisory fails the build; fix it by upgrading the affected dependency (the `b6dbe80 Patch vulnerable transitive dependencies` commit is the precedent).

## Package Management

npm is canonical: `package-lock.json` is committed and CI installs with `npm ci`. `pnpm-lock.yaml` files are gitignored, so pnpm is safe for local use but the two lockfiles never diverge in version control. The committed `email-worker/pnpm-workspace.yaml` only configures pnpm's build-script allowlist (`esbuild`, `sharp`, `workerd`) for local pnpm users and has no effect on the npm-based CI.
