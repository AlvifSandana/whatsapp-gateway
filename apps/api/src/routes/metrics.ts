import { Hono } from "hono";
import { redis } from "../redis";

const app = new Hono();

const queueKeys = [
  "q:campaign:plan",
  "q:campaign:send",
  "q:campaign:dead",
  "q:message:send",
  "q:message:dead",
  "q:contacts:import:validate",
  "q:contacts:import:commit",
  "q:reports:export",
];

app.get("/", async (c) => {
  const lengths = await Promise.all(queueKeys.map((key) => redis.llen(key)));
  const activeKeys = queueKeys.map((key) => `metrics:q:${key}:active`);
  const failedKeys = queueKeys.map((key) => `metrics:q:${key}:failed`);
  const [actives, faileds] = await Promise.all([
    redis.mget(activeKeys),
    redis.mget(failedKeys),
  ]);

  const queues = queueKeys.reduce<Record<string, number>>((acc, key, idx) => {
    acc[key] = lengths[idx] ?? 0;
    acc[`${key}:active`] = Number(actives[idx] || 0);
    acc[`${key}:failed`] = Number(faileds[idx] || 0);
    return acc;
  }, {});

  return c.json({ data: { queues } });
});

export default app;
