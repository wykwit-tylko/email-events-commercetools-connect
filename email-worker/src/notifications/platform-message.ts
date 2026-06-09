import type { EnqueuedCommerceNotification } from '../env';

export type PlatformCommerceNotification = EnqueuedCommerceNotification;

export function isOrderCreatedNotification(
  notification: PlatformCommerceNotification | undefined,
): notification is PlatformCommerceNotification & {
  id: string;
  type: 'OrderCreated';
  order: { customerEmail: string };
} {
  return (
    notification?.notificationType === 'Message' &&
    notification.id !== undefined &&
    notification.type === 'OrderCreated' &&
    typeof notification.order?.customerEmail === 'string' &&
    notification.order.customerEmail.length > 0
  );
}
