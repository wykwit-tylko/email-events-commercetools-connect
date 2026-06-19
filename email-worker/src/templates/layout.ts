/**
 * Shared ShelfMarket email layout.
 *
 * Mirrors the storefront design tokens (uno.config.ts): Helvetica stack,
 * off-white page on a bordered off-white panel, near-black ink, square
 * corners, uppercase eyebrows. Colors are the sRGB equivalents of the
 * storefront's oklch palette. Layout is table-based with inline styles for
 * email-client compatibility.
 */

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

const FONT_STACK = "Helvetica, Arial, sans-serif";

const COLOR = {
  /** offwhite-700: page background */
  page: "#f5f5f5",
  /** offwhite-600: surface-panel background */
  panel: "#fcfbfa",
  /** beige-200: surface-panel border */
  border: "#e6e3e0",
  /** beige-100: highlighted surfaces (code box) */
  surface: "#f2efee",
  /** offblack-900: ink, solid buttons */
  ink: "#1a1818",
  /** offblack-700: body copy */
  muted: "#2f2f2f",
  /** grey-900: footer, fine print */
  subtle: "#7c7d81",
} as const;

/**
 * Strips trailing slashes so `https://x.dev/` + `/orders/...` does not
 * produce `//orders/...`. All templates run their storeUrl through this
 * before building links.
 */
export function normalizeStoreUrl(storeUrl: string): string {
  return storeUrl.replace(/\/+$/, "");
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** Body paragraph; pass pre-escaped HTML. */
export function paragraph(html: string): string {
  return `<p style="margin: 0 0 16px; font-family: ${FONT_STACK}; font-size: 14px; line-height: 22px; color: ${COLOR.muted};">${html}</p>`;
}

/** Solid call-to-action button in the storefront's btn-solid voice. */
export function ctaButton(label: string, url: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 8px 0 24px;">
      <tr>
        <td style="background: ${COLOR.ink};">
          <a href="${escapeHtml(url)}" style="display: inline-block; padding: 16px 28px; font-family: ${FONT_STACK}; font-size: 14px; font-weight: 600; color: ${COLOR.page}; text-decoration: none;">${escapeHtml(label)}</a>
        </td>
      </tr>
    </table>`;
}

/** Small-print fallback for clients that block button links. */
export function linkFallback(url: string): string {
  return `<p style="margin: 0 0 16px; font-family: ${FONT_STACK}; font-size: 12px; line-height: 18px; color: ${COLOR.subtle}; word-break: break-all;">Or copy and paste this link into your browser:<br><a href="${escapeHtml(url)}" style="color: ${COLOR.ink};">${escapeHtml(url)}</a></p>`;
}

/** Prominent copy-paste box for one-time codes. */
export function codeBox(code: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 8px 0 24px;">
      <tr>
        <td style="background: ${COLOR.surface}; border: 1px solid ${COLOR.border}; padding: 20px 24px; font-family: 'Courier New', Courier, monospace; font-size: 16px; font-weight: 700; color: ${COLOR.ink}; word-break: break-all;">${escapeHtml(code)}</td>
      </tr>
    </table>`;
}

export interface ShelfMarketEmailContent {
  /** Uppercase context label, e.g. "Account" or "Orders". */
  eyebrow: string;
  title: string;
  /** Pre-escaped HTML blocks (paragraph, ctaButton, codeBox, ...). */
  bodyHtml: string;
  /** Plain-text note for the footer, e.g. who the email was sent to. */
  footerNote: string;
}

export function renderShelfMarketHtml(
  content: ShelfMarketEmailContent,
  rawStoreUrl: string,
): string {
  const storeUrl = normalizeStoreUrl(rawStoreUrl);
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
  </head>
  <body style="margin: 0; padding: 0; background: ${COLOR.page};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: ${COLOR.page};">
      <tr>
        <td align="center" style="padding: 32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px;">
            <tr>
              <td style="padding: 0 4px 16px;">
                <a href="${escapeHtml(storeUrl)}" style="font-family: ${FONT_STACK}; font-size: 20px; font-weight: 600; letter-spacing: -0.04em; color: ${COLOR.ink}; text-decoration: none;">ShelfMarket</a>
              </td>
            </tr>
            <tr>
              <td style="background: ${COLOR.panel}; border: 1px solid ${COLOR.border}; padding: 40px;">
                <p style="margin: 0 0 14px; font-family: ${FONT_STACK}; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.18em; color: ${COLOR.muted};">${escapeHtml(content.eyebrow)}</p>
                <h1 style="margin: 0 0 20px; font-family: ${FONT_STACK}; font-size: 28px; line-height: 38px; font-weight: 600; letter-spacing: -0.01em; color: ${COLOR.ink};">${escapeHtml(content.title)}</h1>
                ${content.bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding: 20px 4px; font-family: ${FONT_STACK}; font-size: 12px; line-height: 18px; color: ${COLOR.subtle};">
                <p style="margin: 0 0 6px;">${escapeHtml(content.footerNote)}</p>
                <p style="margin: 0;">Copyright &copy; ${year} Tylko. All rights reserved. &middot; <a href="${escapeHtml(storeUrl)}/legal-notice" style="color: ${COLOR.subtle};">Legal Notice</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
