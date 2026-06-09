# Event Proxy

A minimal commercetools Connect event application that forwards Commerce Notifications to Cloudflare Queue for an email Worker.

The proxy does not decide email intent. It does not choose recipients, templates, suppression rules, or whether an email should be sent.

## Behavior

- Receives Commerce Notifications through Connect-managed event delivery at `POST /event-proxy`.
- Publishes the Commerce Notification body directly to Cloudflare Queue using the HTTP Push API.
- Parses the Commerce Notification as JSON at the Queue boundary so the Worker can filter by fields like `type`.
- Returns `200` only after forwarding succeeds, unless dry-run mode is enabled.
- Returns non-2xx on forwarding failure or timeout so Connect can retry.
- Does not normalize, deduplicate, or decide email intent.
- Does not log raw Commerce Notification payloads.
- Can expose development-only in-memory inspection endpoints.

Connect event delivery can wrap the Commerce Notification in a transport envelope. The app unwraps these outer envelopes before publishing:

- Google Cloud Pub/Sub: decodes `message.data` from base64.
- AWS SNS: reads `Message`.

The inner Commerce Notification is parsed as JSON and published to Cloudflare Queue as a JSON message.

## Configuration

See `event-proxy/.env.example` for all variables.

## Project Structure

```text
./
├── connect.yaml       # Connector application declaration
├── CONTEXT.md         # domain glossary
├── docs/              # plans and follow-up design notes
└── event-proxy/       # self-contained Connect event application
    ├── package.json
    └── src/
        ├── config/    # environment parsing and defaults
        ├── infra/     # email-worker and commercetools API integrations
        ├── scripts/   # local subscriber and Connect lifecycle scripts
        ├── server/    # HTTP event endpoint and raw body handling
        ├── shared/    # logging and small shared utilities
        ├── test/      # test fixtures and fakes
        └── index.ts   # application entrypoint
└── email-worker/      # Cloudflare Worker for queueing and sending emails
```

Required runtime variables:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_QUEUE_ID`
- `CLOUDFLARE_API_TOKEN`

Common optional runtime variables:

- `MAX_BODY_BYTES`, default `90000`
- `FORWARDING_TIMEOUT_MS`, default `2000`
- `DRY_RUN_FORWARDING`, default `false`
- `DEV_INSPECTION_ENABLED`, default `false`
- `DEV_INSPECTION_MAX_MESSAGES`, default `100`
- `PORT`, default `8080`

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
CLOUDFLARE_ACCOUNT_ID=local CLOUDFLARE_QUEUE_ID=local CLOUDFLARE_API_TOKEN=local DRY_RUN_FORWARDING=true DEV_INSPECTION_ENABLED=true npm run dev
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

## Scripts

```bash
cd event-proxy
npm run dev
npm test
npm run build
npm run connector:post-deploy
npm run connector:pre-undeploy
```

From `email-worker/`:

```bash
npm run dev
npm test
npm run build
npm run deploy
```

## Subscription Management

`connector:post-deploy` creates or updates one commercetools Subscription by `CT_SUBSCRIPTION_KEY`.

MVP rules:

- Message subscriptions only.
- Resource-type filters only.
- Platform delivery format by default.
- No message `types` filters.
- Existing Subscriptions with Change/Event subscriptions are not overwritten.

`connector:pre-undeploy` deletes only the Subscription matching `CT_SUBSCRIPTION_KEY`.
