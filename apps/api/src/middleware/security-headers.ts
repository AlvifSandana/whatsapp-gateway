import type { Context, Next } from "hono";
import { config } from "../config";

export const securityHeadersMiddleware = async (c: Context, next: Next) => {
  await next();

  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  if (config.hstsEnabled) {
    c.header("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
};
