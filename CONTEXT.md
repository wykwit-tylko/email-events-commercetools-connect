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
