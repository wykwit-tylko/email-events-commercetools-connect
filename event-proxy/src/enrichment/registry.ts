import { customerEmailTokenEnricher } from "./customer-email-token.js";
import { customerPasswordTokenEnricher } from "./customer-password-token.js";
import { orderCreatedEnricher } from "./order-created.js";
import type { CommerceNotificationEnricher } from "./pipeline.js";

export const defaultEnrichers: CommerceNotificationEnricher[] = [
  orderCreatedEnricher,
  customerEmailTokenEnricher,
  customerPasswordTokenEnricher,
];
