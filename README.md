# Event Proxy

A minimal commercetools Connect event application that forwards Commerce Notifications to outbound publishers (Cloudflare Queue or HTTP webhooks) for downstream consumers. The email Worker consumes the queue, while the store backend can receive signed webhook deliveries.

The proxy does not decide email intent. It does not choose recipients, templates, suppression rules, or whether an email should be sent.

## Behavior

- Receives Commerce Notifications through Connect-managed event delivery at `POST /event-proxy`.
- Publishes the Commerce Notification body through the configured outbound publisher adapter.
- Parses the Commerce Notification as JSON at the publisher seam so the proxy can optionally filter by fields like `type`.
- Can filter forwarded Commerce Notifications with `CT_MESSAGE_TYPES` while leaving email intent to the Worker.
- Returns `200` as soon as at least one outbound publisher accepts the notification (or immediately in dry-run mode), so a single slow or failing publisher does not trigger commercetools redelivery for the others. With multiple publishers, partial failures are logged as warnings rather than retried via commercetools.
- Returns non-2xx only when every outbound publisher fails, or on forwarding timeout, so Connect can retry.
- Does not normalize, deduplicate, or decide email intent.
- Does not log raw Commerce Notification payloads.
- Can expose development-only in-memory inspection endpoints.

Connect event delivery can wrap the Commerce Notification in a transport envelope. The app unwraps these outer envelopes before publishing:

- Google Cloud Pub/Sub: decodes `message.data` from base64.
- AWS SNS: reads `Message`.

The inner Commerce Notification is parsed as JSON and published through the configured publisher as a JSON message.

## Configuration

See `event-proxy/.env.example` for all Event Proxy variables and `email-worker/wrangler.example.toml` for Worker bindings. See `docs/deployment.md` for Cloudflare setup and deployment steps.

## Project Structure

```text
./
├── connect.yaml       # Connector application declaration
├── CONTEXT.md         # domain glossary
├── docs/              # plans and follow-up design notes
├── event-proxy/       # self-contained Connect event application
│   ├── package.json
│   └── src/
│       ├── config/    # environment parsing and defaults
│       ├── enrichment/ # proxy enrichment for selected Commerce Notifications
│       ├── infra/     # outbound publisher and commercetools API integrations
│       ├── scripts/   # Connect lifecycle scripts
│       ├── server/    # HTTP event endpoint and raw body handling
│       ├── shared/    # logging and small shared utilities
│       ├── test/      # test fixtures and fakes
│       └── index.ts   # application entrypoint
└── email-worker/      # Cloudflare Worker for queueing and sending emails
```

Required Event Proxy runtime variables:

- `OUTBOUND_PUBLISHER_CONFIG`

Common optional runtime variables:

- `MAX_BODY_BYTES`, default `90000`
- `FORWARDING_TIMEOUT_MS`, default `2000`
- `DRY_RUN_FORWARDING`, default `false`
- `DEV_INSPECTION_ENABLED`, default `false`
- `DEV_INSPECTION_MAX_MESSAGES`, default `100`
- `DEV_INSPECTION_TOKEN`, required for development inspection endpoints to be reachable
- `PORT`, default `8080`
- `CT_MESSAGE_TYPES`, default empty, meaning all Commerce Notification message types are forwarded
- `CT_MESSAGE_RESOURCE_TYPES`, the commercetools Subscription's message resource types (see `connect.yaml`). Controls which Commerce Notifications reach the proxy at all

Filtering works in two stages. `CT_MESSAGE_RESOURCE_TYPES` (subscription-level) decides which Commerce Notifications commercetools delivers to the proxy; `CT_MESSAGE_TYPES` (proxy-level) decides which of those the proxy publishes onward to the queue and worker. Set `CT_MESSAGE_TYPES` to the handled types (`OrderCreated,CustomerEmailTokenCreated,CustomerPasswordTokenCreated,PaymentTransactionAdded,PaymentTransactionStateChanged`) so the worker never pays queue cost for messages it would ignore. Narrowing `CT_MESSAGE_RESOURCE_TYPES` further only reduces Connect delivery volume and proxy processing; do not narrow it without confirming, in your commercetools project, which `resourceTypeId` delivers each handled message type (the token messages in particular), or those notifications will stop reaching the proxy.

commercetools deployment credentials:

- `connect.yaml` uses `inheritAs.apiClient.scopes` with `manage_subscriptions` and `manage_customers`.
- Connect automatically provides `CTP_API_URL`, `CTP_AUTH_URL`, `CTP_PROJECT_KEY`, `CTP_CLIENT_ID`, `CTP_CLIENT_SECRET`, and `CTP_SCOPE` at runtime.
- For local script testing outside Connect, provide either `CTP_API_URL` and `CTP_AUTH_URL`, or provide `CTP_REGION` so the app can derive them.

Connect-provided event variables used by `postDeploy`:

- `CONNECT_SUBSCRIPTION_DESTINATION`
- `CONNECT_GCP_PROJECT_ID`
- `CONNECT_GCP_TOPIC_NAME`
- `CONNECT_AWS_TOPIC_ARN`

## Local Development

### Event Proxy Dry Run

Install dependencies:

```bash
cd event-proxy
npm install
```

Start the app in dry-run inspection mode:

```bash
cd event-proxy
OUTBOUND_PUBLISHER_CONFIG='{"type":"cloudflare-queue","accountId":"local","queueId":"local","apiToken":"local"}' \
DRY_RUN_FORWARDING=true \
DEV_INSPECTION_ENABLED=true \
DEV_INSPECTION_TOKEN=change-me-inspection-token \
npm run dev

# Or with an HTTP webhook instead:
# OUTBOUND_PUBLISHER_CONFIG='{"type":"http-webhook","endpointUrl":"https://store.local/api/webhooks/events","emailEventSecret":"local-secret"}'
```

Post a sample Platform Commerce Notification:

```bash
curl -X POST http://localhost:8080/event-proxy \
  -H 'Content-Type: application/json' \
  -d '{"notificationType":"Message","projectKey":"demo","id":"message-id","version":1,"sequenceNumber":1,"resource":{"typeId":"order","id":"order-id"},"resourceVersion":1,"type":"OrderCreated","createdAt":"2026-06-09T12:00:00.000Z","lastModifiedAt":"2026-06-09T12:00:00.000Z"}'
```

Inspect dry-run messages:

```bash
curl -H 'Authorization: Bearer change-me-inspection-token' \
  http://localhost:8080/event-proxy/dev/messages
```

### Email Worker

Install Worker dependencies:

```bash
cd email-worker
npm install
```

Run type checks and tests:

```bash
npm run build
npm test
```

Run the Worker locally:

```bash
EMAIL_SENDING_ENABLED=false npm run dev
```

## Deployment

See `docs/deployment.md` for the full Cloudflare and commercetools setup checklist.

### Basic Cloudflare Setup

Create the queue, dead-letter queue, and KV namespace before deploying the Worker:

```bash
cd email-worker
npx wrangler queues create commerce-notifications-email-dev
npx wrangler queues create email-events-dlq
npx wrangler kv namespace create EMAIL_DEDUPE
```

Then copy `email-worker/wrangler.example.toml` to `email-worker/wrangler.toml`, set the queue name and KV namespace ID, configure Cloudflare Email Sending for the sender domain, and set production secrets with `wrangler secret put` rather than committing them in `wrangler.toml`.

### Event Proxy (commercetools Connect)

The deploy script automates staging, publishing, and deployment update/create where the API client has sufficient Connect permissions.

```bash
cd event-proxy
npm run deploy        # stage → publish → generate config flags
npm run deploy -- --dry-run   # preview config without side effects
```

The deploy script:

1. Reads `.env` from the working directory
2. Auto-constructs `OUTBOUND_PUBLISHER_CONFIG` from `CF_ACCOUNT_ID`, `CF_QUEUE_ID`, `CF_QUEUE_API_TOKEN` if the full JSON is not present (single cloudflare-queue publisher only)
3. Validates prerequisites (commercetools CLI installed, credentials present)
4. Authenticates and stages the connector from the latest git tag
5. Publishes the staged connector
6. Updates an existing deployment when possible, otherwise creates a new deployment
7. Generates base64-encoded configuration values for comma-containing values

**How comma-containing configs work:**
The commercetools CLI `--configuration` flag splits values on commas. The deploy script transparently **base64-encodes** them with a `b64:` prefix. The app detects and decodes them at startup.

**Known limitation:** `commercetools connect deployment create` or update can return "Access denied" depending on your API client's Connect permissions. If this happens:

- Use the generated `--configuration` flags from the dry-run output
- Create the deployment manually via the Merchant Center Connect UI
- Or ensure your CLI API client has Connect deployment management scopes

Required `.env` variables:

- `CTP_CLIENT_ID`, `CTP_CLIENT_SECRET`, `CTP_PROJECT_KEY`, `CTP_REGION` (or `CTP_AUTH_URL`)
- Either `OUTBOUND_PUBLISHER_CONFIG` as JSON (single object or array for fan-out), or `CF_ACCOUNT_ID` + `CF_QUEUE_ID` + `CF_QUEUE_API_TOKEN` (single cloudflare-queue only)
- `CT_MESSAGE_TYPES` (e.g. `OrderCreated,CustomerEmailTokenCreated,CustomerPasswordTokenCreated,PaymentTransactionAdded,PaymentTransactionStateChanged`)

The `connector:post-deploy` hook automatically creates the commercetools Subscription after deployment.

### Email Worker (Cloudflare)

1. Deploy the Worker and its KV namespace:
   ```bash
   cd email-worker
   npm run deploy
   ```
2. Bindings (`wrangler.toml`) must include:
   - `EMAIL` — Cloudflare Email Service binding
   - `EMAIL_DEDUPE` — KV namespace for deduplication and dead-letter replay backup
   - `STATS` — Durable Object holding atomic counters (read via `GET /stats`)
   - `EMAIL_QUEUE` — producer binding to the main queue, used to replay dead-lettered messages
   - `DLQ_QUEUE_NAME` — name of the dead-letter queue the Worker also consumes
   - `DLQ_REPLAY_TTL_SECONDS` — TTL (seconds) for dead-letter replay backups kept in KV
   - `FROM_EMAIL` — sender address
   - `INTERNAL_NOTIFICATION_EMAILS` — comma-separated internal recipients for Payment transaction notifications
   - `STORE_URL` — storefront URL for links (e.g. `https://shelfmarket.tylko.dev`)
   - `ORDER_LINK_SECRET` — shared with the storefront, signs guest order links in order confirmation emails (links omit the key when unset)
   - `ADMIN_TOKEN` — secret gating the `/admin/replay-dlq` and `/admin/dlq` endpoints
   - `ALERT_WEBHOOK_URL` — optional secret, POSTed when a message lands in the dead-letter queue
   - The DLQ `[[queues.consumers]]` and the `[[migrations]] new_sqlite_classes` entry for `StatsDurableObject` are also required; see `docs/deployment.md`.

### Deployment Order

1. Create the Cloudflare Queue, DLQ, KV namespace, Email Sending binding, and Worker config.
2. Deploy the **Email Worker** first so the Cloudflare Queue consumer exists.
3. Deploy the **Event Proxy** with `OUTBOUND_PUBLISHER_CONFIG` pointing to the Worker queue.
4. The proxy's `postDeploy` hook creates the commercetools Subscription.

## Scripts

```bash
cd event-proxy
npm run dev
npm test
npm run build
npm run deploy          # full Connect deployment pipeline
npm run connector:post-deploy
npm run connector:pre-undeploy
```

From `email-worker/`:

```bash
npm run dev
npm test
npm run test:e2e        # Workers-runtime e2e via Miniflare (see docs/deployment.md)
npm run build
npm run typegen         # generate wrangler types
npm run deploy          # wrangler deploy
```

## Subscription Management

`connector:post-deploy` creates or updates one commercetools Subscription by `CT_SUBSCRIPTION_KEY`.

MVP rules:

- Message subscriptions only.
- Resource-type filters only.
- Platform delivery format by default.
- Optional proxy-level message type forwarding filter via `CT_MESSAGE_TYPES`.
- Existing Subscriptions with Change/Event subscriptions are not overwritten.

`connector:pre-undeploy` deletes only the Subscription matching `CT_SUBSCRIPTION_KEY`.
