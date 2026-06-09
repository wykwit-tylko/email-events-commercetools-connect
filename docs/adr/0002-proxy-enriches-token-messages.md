# Proxy enriches Commerce Notifications before publishing

The Event Proxy enriches `CustomerEmailTokenCreated` and `CustomerPasswordTokenCreated` Commerce Notifications before publishing them to the queue. It fetches the customer's email address from the commercetools API using the `customerId` present in the message and adds `customerEmail` to the payload. If the token `value` is absent (which occurs when commercetools token validity exceeds 60 minutes), the proxy skips publishing entirely.

We chose this because the commercetools Platform Messages for these token events include the `customerId` and token `value` (for short-lived tokens) but omit the `customerEmail`. The Worker cannot send emails without the recipient address. Rather than giving the Worker a commercetools API client (which would make it more than a queue consumer), we push the enrichment upstream to the proxy where the commercetools credentials already exist. This keeps the Worker as a passive consumer that trusts the proxy to provide complete, actionable payloads.

This means the proxy is no longer a pure pass-through for all message types. It conditionally inspects and enriches based on `notification.type`. The Worker keeps its type guards as a safety net but can now assume `customerEmail` is present for token messages.
