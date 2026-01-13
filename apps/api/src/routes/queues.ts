import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { redis } from "../redis";

const app = new Hono();

const dlqSchema = z.object({
  type: z.enum(["message", "campaign"]),
  limit: z.number().int().min(1).max(200).optional(),
});

app.get(
  "/dlq",
  zValidator(
    "query",
    z.object({
      type: z.enum(["message", "campaign"]),
      limit: z.string().optional(),
    }),
  ),
  async (c) => {
    const query = c.req.valid("query");
    const limit = query.limit ? Number(query.limit) : 50;
    const listKey = query.type === "message" ? "q:message:dead" : "q:campaign:dead";
    const items = await redis.lrange(listKey, 0, Math.min(limit, 200) - 1);
    return c.json({
      data: items.map((item) => {
        try {
          return JSON.parse(item);
        } catch {
          return item;
        }
      }),
    });
  },
);

app.post("/dlq/requeue", zValidator("json", dlqSchema), async (c) => {
  const input = c.req.valid("json");
  const listKey = input.type === "message" ? "q:message:dead" : "q:campaign:dead";
  const targetKey = input.type === "message" ? "q:message:send" : "q:campaign:send";
  const limit = input.limit ?? 20;

  let moved = 0;
  for (let i = 0; i < limit; i += 1) {
    const item = await redis.rpop(listKey);
    if (!item) break;
    await redis.rpush(targetKey, item);
    moved += 1;
  }

  return c.json({ data: { moved } });
});

export default app;
