import type { MiddlewareHandler } from "hono";

export function securityHeadersMiddleware(): MiddlewareHandler {
  return async (context, next) => {
    context.header("x-content-type-options", "nosniff");
    context.header("referrer-policy", "strict-origin-when-cross-origin");
    context.header("x-frame-options", "DENY");
    context.header("permissions-policy", "camera=(), microphone=(), geolocation=()");
    await next();
  };
}
