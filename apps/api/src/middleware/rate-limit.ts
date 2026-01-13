import type { Context, Next } from "hono";
import { redis } from "../redis";
import { config } from "../config";

const getClientIp = (c: Context) => {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return c.req.header("x-real-ip") || "unknown";
};

export const rateLimitMiddleware = async (c: Context, next: Next) => {
  const path = c.req.path;
  if (path.startsWith("/health") || path.startsWith("/v1/events")) {
    return next();
  }

  const ip = getClientIp(c);
  const windowSec = config.rateLimitWindowSeconds;
  const max = config.rateLimitMax;
  if (!windowSec || !max || max <= 0) return next();

  const key = `rl:api:${ip}:${Math.floor(Date.now() / (windowSec * 1000))}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSec);
  }

  if (count > max) {
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

  return next();
};
