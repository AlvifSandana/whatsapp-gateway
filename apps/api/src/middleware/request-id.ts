import type { Context, Next } from "hono";
import { randomUUID } from "node:crypto";

export const requestIdMiddleware = async (c: Context, next: Next) => {
  const incoming = c.req.header("x-request-id");
  const requestId = incoming || randomUUID();
  c.set("requestId", requestId);
  c.header("x-request-id", requestId);
  await next();
};
