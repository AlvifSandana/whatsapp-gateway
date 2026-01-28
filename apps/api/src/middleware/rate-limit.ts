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
  if (path.startsWith("/health") || path.startsWith("/v1/events") || path.startsWith("/v1/metrics")) {
    return next();
  }

  const auth = c.get("auth") as any;
  const identifier = auth?.workspaceId ? `ws:${auth.workspaceId}` : auth?.userId ? `u:${auth.userId}` : `ip:${getClientIp(c)}`;

  const windowSec = config.rateLimitWindowSeconds || 60;
  const max = config.rateLimitMax || 100;
  if (max <= 0) return next();

  const key = `rl:sliding:${identifier}`;
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const minTimestamp = now - windowMs;

  try {
    const multi = redis.multi();
    multi.zremrangebyscore(key, 0, minTimestamp);
    multi.zadd(key, now, `${now}-${Math.random()}`);
    multi.zcard(key);
    multi.expire(key, windowSec + 1);

    const results = await multi.exec();
    if (!results) return next();

    // results[2][1] is the output of zcard
    const count = results[2][1] as number;

    if (count > max) {
      return c.json({
        error: "Rate limit exceeded",
        retryAfter: windowSec,
        limit: max,
        remaining: 0
      }, 429);
    }

    c.header("X-RateLimit-Limit", max.toString());
    c.header("X-RateLimit-Remaining", Math.max(0, max - count).toString());

    return next();
  } catch (err) {
    console.error("Rate limit check failed", err);
    return next();
  }
};


