import type { Env } from '../env';
import type { RenderedEmail } from '../templates/order-created';

export async function sendEmail(
  env: Env,
  options: { to: string; email: RenderedEmail },
): Promise<void> {
  await env.EMAIL.send({
    to: options.to,
    from: env.FROM_EMAIL,
    subject: options.email.subject,
    html: options.email.html,
    text: options.email.text,
  });
}
