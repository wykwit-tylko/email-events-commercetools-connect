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
- `FROM_EMAIL`: sender address approved for Cloudflare Email Sending.
- `STORE_URL`: storefront URL used in verification, password reset, and order links.
- `EMAIL_SENDING_ENABLED`: keep `false` until templates and recipients are safe to test.

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

## Smoke Test

1. Keep `EMAIL_SENDING_ENABLED=false` for the first queue delivery test.
2. Deploy the Worker.
3. Deploy the Event Proxy with `DRY_RUN_FORWARDING=false`.
4. Trigger an `OrderCreated`, `CustomerEmailTokenCreated`, or `CustomerPasswordTokenCreated` Commerce Notification in the commercetools project.
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
