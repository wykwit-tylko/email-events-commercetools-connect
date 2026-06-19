# Event Proxy

This context describes the language for a proxy that receives commercetools-originated notifications and exposes them to a downstream email service.

## Language

**Commerce Notification**:
An inbound notification emitted by a commercetools Subscription. It usually carries a commercetools Message payload, such as an order-related message.
_Avoid_: Event, message, fired event, commercetools event

**Email Event**:
A Commerce Notification exposed on the outbound queue for email workflows. It is not interpreted by the proxy unless a queue boundary requires format adaptation.
_Avoid_: Normalized event, email command, forwarded message

**Event Proxy**:
A boundary component that passes Commerce Notifications toward the email service without deciding email intent. It does not choose recipients, templates, suppression rules, or whether an email should be sent.
_Avoid_: Email router, email orchestrator, email rules engine

**Proxy Enrichment**:
The proxy fetching missing fields from the commercetools API and injecting them into a Commerce Notification before publishing it as an Email Event. Example: retrieving `customerEmail` for token messages because the Platform Message omits it. This keeps the worker passive and simple.
_Avoid_: Normalization, transformation, message augmentation

**Outbound Publisher**:
The adapter that forwards Commerce Notifications to the outbound boundary. Supported types are `cloudflare-queue` and `http-webhook` (signed POST to an HTTP endpoint). The proxy does not interpret the notification when forwarding; it only adapts to the boundary's format requirements. When more than one is configured, a Composite Publisher fans every notification out to all of them in parallel.
_Avoid_: Publisher adapter, queue driver, forwarder

**Publisher Config**:
The JSON configuration that specifies how an Outbound Publisher connects to its boundary (e.g. account ID, queue ID, API token for `cloudflare-queue`; endpoint URL and `emailEventSecret` for `http-webhook`). `OUTBOUND_PUBLISHER_CONFIG` holds a single object or an array for fan-out, or is auto-constructed from `CF_*` environment variables by the deploy script.
_Avoid_: Queue credentials, broker config

**Message Type Filter**:
The `CT_MESSAGE_TYPES` allowlist that controls which Commerce Notification types the proxy forwards. Applied after unwrapping the transport envelope but before publishing. Does not affect what the commercetools Subscription subscribes to (that's `CT_MESSAGE_RESOURCE_TYPES`).
_Avoid_: Message filter, event filter, type whitelist
