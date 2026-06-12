# Event Proxy

A minimal commercetools Connect event application that forwards Commerce Notifications to Cloudflare Queue for an email Worker.

The proxy does not decide email intent. It does not choose recipients, templates, suppression rules, or whether an email should be sent.

## Behavior

- Receives Commerce Notifications through Connect-managed event delivery at `POST /event-proxy`.
- Publishes the Commerce Notification body through the configured outbound publisher adapter.
- Parses the Commerce Notification as JSON at the publisher seam so the proxy can optionally filter by fields like `type`.
- Can filter forwarded Commerce Notifications with `CT_MESSAGE_TYPES` while leaving email intent to the Worker.
- Returns `200` only after forwarding succeeds, unless dry-run mode is enabled.
- Returns non-2xx on forwarding failure or timeout so Connect can retry.
- Does not normalize, deduplicate, or decide email intent.
- Does not log raw Commerce Notification payloads.
- Can expose development-only in-memory inspection endpoints.

Connect event delivery can wrap the Commerce Notification in a transport envelope. The app unwraps these outer envelopes before publishing:

- Google Cloud Pub/Sub: decodes `message.data` from base64.
- AWS SNS: reads `Message`.

The inner Commerce Notification is parsed as JSON and published through the configured publisher as a JSON message.

## Configuration

See `event-proxy/.env.example` for all variables.

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
│       ├── infra/     # email-worker and commercetools API integrations
│       ├── scripts/   # local subscriber and Connect lifecycle scripts
│       ├── server/    # HTTP event endpoint and raw body handling
│       ├── shared/    # logging and small shared utilities
│       ├── test/      # test fixtures and fakes
│       └── index.ts   # application entrypoint
└── email-worker/      # Cloudflare Worker for queueing and sending emails
```

Required runtime variables:

- `OUTBOUND_PUBLISHER_CONFIG`

Common optional runtime variables:

- `MAX_BODY_BYTES`, default `90000`
- `FORWARDING_TIMEOUT_MS`, default `2000`
- `DRY_RUN_FORWARDING`, default `false`
- `DEV_INSPECTION_ENABLED`, default `false`
- `DEV_INSPECTION_MAX_MESSAGES`, default `100`
- `PORT`, default `8080`
- `CT_MESSAGE_TYPES`, default empty, meaning all Commerce Notification message types are forwarded

commercetools deployment credentials:

- `connect.yaml` uses `inheritAs.apiClient.scopes` with `manage_subscriptions`.
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
OUTBOUND_PUBLISHER_CONFIG='{"type":"cloudflare-queue","accountId":"local","queueId":"local","apiToken":"local"}' DRY_RUN_FORWARDING=true DEV_INSPECTION_ENABLED=true npm run dev
```

Post a sample Platform Commerce Notification:

```bash
curl -X POST http://localhost:8080/event-proxy \
  -H 'Content-Type: application/json' \
  -d '{"notificationType":"Message","projectKey":"demo","id":"message-id","version":1,"sequenceNumber":1,"resource":{"typeId":"order","id":"order-id"},"resourceVersion":1,"type":"OrderCreated","createdAt":"2026-06-09T12:00:00.000Z","lastModifiedAt":"2026-06-09T12:00:00.000Z"}'
```

Inspect dry-run messages:

```bash
curl http://localhost:8080/event-proxy/dev/messages
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

### Event Proxy (commercetools Connect)

The deploy script automates staging, publishing, and configuration generation. Deployment creation itself may require additional Connect permissions.

```bash
cd event-proxy
npm run deploy        # stage → publish → generate config flags
npm run deploy -- --dry-run   # preview config without side effects
```

The deploy script:
1. Reads `.env` from the working directory
2. Auto-constructs `OUTBOUND_PUBLISHER_CONFIG` from `CF_ACCOUNT_ID`, `CF_QUEUE_ID`, `CF_QUEUE_API_TOKEN` if the full JSON is not present
3. Validates prerequisites (commercetools CLI installed, credentials present)
4. Authenticates and stages the connector from the latest git tag
5. Publishes the staged connector
6. Generates base64-encoded `--configuration` flags for all comma-containing values

**How comma-containing configs work:**
The commercetools CLI `--configuration` flag splits values on commas. The deploy script transparently **base64-encodes** them with a `b64:` prefix. The event-proxy app detects and decodes them at startup.

**Known limitation:** The script stages and publishes the connector successfully, but `commercetools connect deployment create` may return "Access denied" depending on your API client's Connect permissions. If this happens:
- Use the generated `--configuration` flags from the dry-run output
- Create the deployment manually via the Merchant Center Connect UI
- Or ensure your CLI API client has Connect deployment management scopes

Required `.env` variables:
- `CTP_CLIENT_ID`, `CTP_CLIENT_SECRET`, `CTP_PROJECT_KEY`, `CTP_REGION` (or `CTP_AUTH_URL`)
- Either `OUTBOUND_PUBLISHER_CONFIG` as JSON, or `CF_ACCOUNT_ID` + `CF_QUEUE_ID` + `CF_QUEUE_API_TOKEN`
- `CT_MESSAGE_TYPES` (e.g. `OrderCreated,CustomerEmailTokenCreated,CustomerPasswordTokenCreated`)

The `connector:post-deploy` hook automatically creates the commercetools Subscription after deployment.

### Email Worker (Cloudflare)

1. Deploy the Worker and its KV namespace:
   ```bash
   cd email-worker
   npm run deploy
   ```
2. Bindings (`wrangler.toml`) must include:
   - `EMAIL` — Cloudflare Email Service binding
   - `EMAIL_DEDUPE` — KV namespace for deduplication
   - `FROM_EMAIL` — sender address
   - `STORE_URL` — storefront URL for links (e.g. `https://shelfmarket.tylko.dev`)
   - `ORDER_LINK_SECRET` — shared with the storefront, signs guest order links in order confirmation emails (links omit the key when unset)

### Deployment Order

1. Deploy the **Email Worker** first so the Cloudflare Queue exists.
2. Deploy the **Event Proxy** with `OUTBOUND_PUBLISHER_CONFIG` pointing to the Worker queue.
3. The proxy's `postDeploy` hook creates the commercetools Subscription.

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
npm run build
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
