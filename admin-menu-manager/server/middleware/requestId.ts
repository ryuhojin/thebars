import type { MiddlewareHandler } from "hono";
import { createRequestId, requestIdHeader } from "../observability/requestId";

export type RequestVariables = {
  requestId: string;
};

export function requestIdMiddleware(): MiddlewareHandler<{ Variables: RequestVariables }> {
  return async (context, next) => {
    const requestId = createRequestId(context.req.header(requestIdHeader));
    context.set("requestId", requestId);
    context.header(requestIdHeader, requestId);
    await next();
  };
}
