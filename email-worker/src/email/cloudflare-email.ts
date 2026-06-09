import type { Env } from '../env';
import type { RenderedEmail } from '../templates/order-created';
import { logger } from '../shared/logger';

export async function sendEmail(
  env: Env,
  options: { to: string; email: RenderedEmail },
): Promise<void> {
  logger.info('email-worker calling email binding', {
    to: options.to,
    from: env.FROM_EMAIL,
    subject: options.email.subject,
  });

  await env.EMAIL.send({
    to: options.to,
    from: env.FROM_EMAIL,
    subject: options.email.subject,
    html: options.email.html,
    text: options.email.text,
  });

  logger.info('email-worker email binding returned');
}
