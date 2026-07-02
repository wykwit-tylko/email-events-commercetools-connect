/**
 * Runtime shim for the `cloudflare:workers` module's `DurableObject` base class.
 *
 * Vitest runs under Node, which does not provide the `cloudflare:workers` module
 * (it only exists in the Workers runtime). This shim lets unit tests construct
 * Durable Object classes directly. Type-checking still comes from
 * `@cloudflare/workers-types`; only runtime resolution is affected, via the
 * `resolve.alias` entry in vitest.config.ts.
 *
 * The real base class stores `ctx`/`env` as class properties; this shim mirrors
 * that so subclasses using `this.ctx` (e.g. for `this.ctx.storage`) keep working.
 */
export class DurableObject {
  readonly ctx: unknown;
  readonly env: unknown;

  constructor(ctx: unknown, env: unknown) {
    this.ctx = ctx;
    this.env = env;
  }
}
