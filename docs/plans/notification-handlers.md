# Email Worker Notification Handlers Plan

## Overview

Expand the Email Worker to support three notification workflows:

1. **Order Confirmation** — `OrderCreated` (existing, template needs improvement)
2. **Account Registration Confirmation** — `CustomerEmailTokenCreated`
3. **Password Reset** — `CustomerPasswordTokenCreated`

Each workflow receives a commercetools Platform Message, validates its shape, and sends an email through the Cloudflare Email Service binding.

---

## commercetools Message Types

### OrderCreated

Already supported. Triggered when an Order is created in commercetools.

- **Resource type**: `order`
- **Message type**: `OrderCreated`
- **Expected payload fields**:
  - `id`: string — Message ID
  - `type`: "OrderCreated"
  - `order`: object — The created order
    - `id`: string — Order ID
    - `orderNumber`: string — Human-readable order number
    - `customerEmail`: string — Email of the customer who placed the order
    - `totalPrice`: object — Order total
      - `currencyCode`: string
      - `centAmount`: number
      - `fractionDigits`: number

### CustomerEmailTokenCreated

Triggered when commercetools creates an email verification token for a customer.

- **Resource type**: `customer`
- **Message type**: `CustomerEmailTokenCreated`
- **Expected payload fields**:
  - `id`: string — Message ID
  - `type`: "CustomerEmailTokenCreated"
  - `customerId`: string — Customer ID
  - `value`: string — The verification token (only present when token validity ≤ 60 minutes)
  - `expiresAt`: string — ISO 8601 expiration datetime
  - `customerEmail`: string — Customer email address (enriched by proxy from commercetools API if absent)
- **Resource**: `{ typeId: "customer", id: customerId }`

**Email purpose**: Send the customer a verification link to confirm their email address.

**Template data needed**:
- Customer email (from `customerEmail`)
- Verification link (constructed from token or customerId)

### CustomerPasswordTokenCreated

Triggered when commercetools creates a password reset token for a customer.

- **Resource type**: `customer`
- **Message type**: `CustomerPasswordTokenCreated`
- **Expected payload fields**:
  - `id`: string — Message ID
  - `type`: "CustomerPasswordTokenCreated"
  - `customerId`: string — Customer ID
  - `value`: string — The reset token (only present when token validity ≤ 60 minutes)
  - `expiresAt`: string — ISO 8601 expiration datetime
  - `customerEmail`: string — Customer email address (enriched by proxy from commercetools API if absent)
- **Resource**: `{ typeId: "customer", id: customerId }`

**Email purpose**: Send the customer a password reset link.

**Template data needed**:
- Customer email (from `customerEmail`)
- Reset link (constructed from token or customerId)

---

## Important: Token Field Name and Presence

The commercetools Platform Messages include the token as `value` (not `tokenValue`), but **only when token validity is 60 minutes or less**. If validity exceeds 60 minutes, `value` is absent.

**Decision**: The proxy skips publishing when `value` is absent. Token messages must be configured with ≤ 60 minutes validity in commercetools.

---

## Worker Structure

```text
email-worker/src/
├── index.ts                          # queue consumer entrypoint
├── queue/
│   └── handler.ts                    # batch loop and explicit dispatch
├── notifications/
│   ├── order-created/
│   │   ├── handler.ts                # OrderCreated guard and workflow
│   │   └── template.ts               # Order confirmation email
│   ├── customer-email-verification/
│   │   ├── handler.ts                # CustomerEmailTokenCreated guard and workflow
│   │   └── template.ts               # Email verification email
│   └── customer-password-reset/
│       ├── handler.ts                # CustomerPasswordTokenCreated guard and workflow
│       └── template.ts               # Password reset email
├── dedupe/
│   └── kv-dedupe-store.ts            # sent:${notification.id}
└── stats/
    └── counters.ts                   # operational counters
```

---

## Handler Design Pattern

Each handler follows the same pattern established by `OrderCreated`:

1. **Type guard** — Narrow the generic `CommerceNotification` to the specific message shape
2. **Invalid notification handling** — Log, increment `ignored` stat, and ack
3. **Dedupe check** — Check KV for `sent:${notification.id}`
4. **Send check** — Check `EMAIL_SENDING_ENABLED`
5. **Email rendering** — Build subject, HTML, and text from template
6. **Send** — Call `env.EMAIL.send()`
7. **Mark sent** — Record in KV and increment `emailsSent` stat
8. **Error handling** — Log, increment `errors` stat, and ack (no retry)

For token messages (`CustomerEmailTokenCreated`, `CustomerPasswordTokenCreated`), the type guard assumes `customerEmail` is present because the proxy enriches the message before publishing. The type guard still validates it as a safety net.

---

## Email Templates

### Order Confirmation (existing, needs improvement)

Current: Plain text with basic HTML
Target: Rich HTML email with order details

**Template data**:
- Order number
- Customer email
- Order total (currency + amount)
- Order ID

### Email Verification (new)

**Template data**:
- Customer email
- Verification link (with token)
- Expiry time

**Example link**: `https://store.example.com/verify-email?token=${tokenValue}&email=${customerEmail}`

**HTML requirements**:
- Clear call-to-action button
- Expiry notice
- Fallback text version with the raw link

### Password Reset (new)

**Template data**:
- Customer email
- Reset link (with token)
- Expiry time

**Example link**: `https://store.example.com/reset-password?token=${tokenValue}&email=${customerEmail}`

**HTML requirements**:
- Clear call-to-action button
- Expiry notice
- Security note (if you didn't request this, ignore)
- Fallback text version with the raw link

---

## Implementation Order

### Phase 1: Add CustomerEmailTokenCreated handler

1. Create `email-worker/src/notifications/customer-email-verification/` directory
2. Create `template.ts` with email verification template
3. Create `handler.ts` with type guard and handler
4. Add `case 'CustomerEmailTokenCreated'` to `queue/handler.ts` dispatch
5. Add tests for the new handler
6. Update proxy `CT_MESSAGE_TYPES` to include `CustomerEmailTokenCreated`

### Phase 2: Add CustomerPasswordTokenCreated handler

1. Create `email-worker/src/notifications/customer-password-reset/` directory
2. Create `template.ts` with password reset template
3. Create `handler.ts` with type guard and handler
4. Add `case 'CustomerPasswordTokenCreated'` to `queue/handler.ts` dispatch
5. Add tests for the new handler
6. Update proxy `CT_MESSAGE_TYPES` to include `CustomerPasswordTokenCreated`

### Phase 3: Improve OrderCreated template

1. Expand `order-created/template.ts` to richer HTML
2. Add order details section (items, totals, shipping address placeholder)
3. Update tests

### Phase 4: Add integration tests

1. Test end-to-end flow: proxy publishes → worker consumes → email sent
2. Test message shape compatibility between proxy and worker

---

## Subscription Configuration

The proxy subscribes to commercetools Messages by resource type. The current default includes `customer` and `customer-email-token` and `customer-password-token` resource types. These are already in the `DEFAULT_MESSAGE_RESOURCE_TYPES` list.

However, `CustomerEmailTokenCreated` and `CustomerPasswordTokenCreated` are messages on the `customer` resource type (the token resources are separate). We need to ensure the subscription includes:
- `customer` — for CustomerCreated, CustomerEmailTokenCreated, CustomerPasswordTokenCreated
- `order` — for OrderCreated

The current default already includes both.

**Important**: `CT_MESSAGE_TYPES` must be updated to include the new message types:
```
CT_MESSAGE_TYPES=OrderCreated,CustomerEmailTokenCreated,CustomerPasswordTokenCreated
```

---

## Open Questions

1. **Token expiry display**: Should the email show the exact expiry time or a human-readable relative time (e.g., "expires in 24 hours")?
2. **Template styling**: Should we use a shared email layout/template wrapper across all handlers to maintain brand consistency?
3. **Customer name in email**: Should we fetch customer first name from the API for personalization (e.g., "Hi Jan, verify your email")?

---

## Testing Plan

### Unit Tests (per handler)

- Type guard accepts valid notification
- Type guard rejects invalid/missing fields
- Dedupe prevents duplicate sends
- Disabled sending skips email
- Send error is logged and acked
- Valid notification sends email with correct content

### Integration Tests

- Proxy publishes `CustomerEmailTokenCreated` message → worker receives and sends verification email
- Proxy publishes `CustomerPasswordTokenCreated` message → worker receives and sends reset email
- Invalid message type is ignored

### Manual Verification

- Trigger customer registration in commercetools → verify email received
- Trigger password reset in commercetools → verify email received
- Place test order → verify order confirmation email received

---

## Configuration Changes

### Worker (`wrangler.toml`)

No changes needed. Existing bindings (KV, Email) are sufficient.

### Proxy (`connect.yaml`)

Update `CT_MESSAGE_TYPES` default or documentation to include new types.

### Proxy (`.env.example`)

Update example to show new message types:
```
CT_MESSAGE_TYPES=OrderCreated,CustomerEmailTokenCreated,CustomerPasswordTokenCreated
```

---

## Risks

1. **Token validity too long**: If commercetools tokens are configured with > 60 minutes validity, `value` is absent and proxy skips publishing. No verification/reset emails are sent. Mitigation: Ensure commercetools token validity is ≤ 60 minutes.
2. **Customer resource type noise**: Subscribing to `customer` resource type means receiving ALL customer messages (address changes, name updates, etc.). Mitigation: `CT_MESSAGE_TYPES` filter on proxy + type guards in worker.
3. **Proxy API dependency**: Enrichment requires the proxy to call commercetools API at runtime. If the API is unavailable, token messages are skipped. Mitigation: Log skipped messages; consider retry logic if needed.
