# Event Proxy

A minimal commercetools Connect event application that forwards Commerce Notifications to NATS.

The proxy does not decide email intent. It does not choose recipients, templates, suppression rules, or whether an email should be sent.

## Behavior

- Receives Commerce Notifications through Connect-managed event delivery at `POST /event-proxy`.
- Publishes the Commerce Notification body to one NATS subject.
- Uses plain NATS pub/sub for the MVP.
- Returns `200` only after NATS publish succeeds.
- Returns non-2xx on NATS publish failure or timeout so Connect can retry.
- Does not parse, normalize, deduplicate, or validate the Commerce Notification payload.
- Does not log raw Commerce Notification payloads.

Connect event delivery can wrap the Commerce Notification in a transport envelope. The app unwraps these outer envelopes before publishing:

- Google Cloud Pub/Sub: decodes `message.data` from base64.
- AWS SNS: reads `Message`.

The inner Commerce Notification bytes are forwarded unchanged.

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
        ├── infra/     # NATS and commercetools API integrations
        ├── scripts/   # local subscriber and Connect lifecycle scripts
        ├── server/    # HTTP event endpoint and raw body handling
        ├── shared/    # logging and small shared utilities
        ├── test/      # test fixtures and fakes
        └── index.ts   # application entrypoint
```

Required runtime variables:

- `NATS_URL`
- `NATS_AUTH_TOKEN`

Common optional runtime variables:

- `NATS_SUBJECT`, default `commerce-notifications.email`
- `MAX_BODY_BYTES`, default `1048576`
- `NATS_PUBLISH_TIMEOUT_MS`, default `2000`
- `PORT`, default `8080`

Required deployment-script variables:

- `CTP_REGION`
- `CTP_PROJECT_KEY`
- `CTP_CLIENT_ID`
- `CTP_CLIENT_SECRET`
- `CTP_SCOPE`, recommended `manage_subscriptions:{projectKey}`

Connect-provided event variables used by `postDeploy`:

- `CONNECT_SUBSCRIPTION_DESTINATION`
- `CONNECT_GCP_PROJECT_ID`
- `CONNECT_GCP_TOPIC_NAME`
- `CONNECT_AWS_TOPIC_ARN`

## Local Development

Install dependencies:

```bash
cd event-proxy
npm install
```

Start NATS locally with token auth:

```bash
docker run --rm -p 4222:4222 nats:2 -js --auth dev-token
```

Start the app:

```bash
cd event-proxy
NATS_URL=nats://localhost:4222 NATS_AUTH_TOKEN=dev-token npm run dev
```

Subscribe to the outbound subject:

```bash
cd event-proxy
NATS_URL=nats://localhost:4222 NATS_AUTH_TOKEN=dev-token npm run dev:subscribe
```

Post a sample Platform Commerce Notification:

```bash
curl -X POST http://localhost:8080/event-proxy \
  -H 'Content-Type: application/json' \
  -d '{"notificationType":"Message","projectKey":"demo","id":"message-id","version":1,"sequenceNumber":1,"resource":{"typeId":"order","id":"order-id"},"resourceVersion":1,"type":"OrderCreated","createdAt":"2026-06-09T12:00:00.000Z","lastModifiedAt":"2026-06-09T12:00:00.000Z"}'
```

## Scripts

```bash
cd event-proxy
npm run dev
npm run dev:subscribe
npm test
npm run build
npm run connector:post-deploy
npm run connector:pre-undeploy
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
