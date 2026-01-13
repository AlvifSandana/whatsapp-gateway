import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getAuditLogs } from "@repo/shared";

const app = new Hono();

const querySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  actorUserId: z.string().uuid().optional(),
  action: z.string().optional(),
  entityType: z.string().optional(),
  cursor: z.string().optional(),
  limit: z
    .string()
    .transform((val) => parseInt(val, 10))
    .optional(),
});

app.get("/", zValidator("query", querySchema), async (c) => {
  const auth = c.get("auth") as any;
  const workspaceId = auth.workspaceId;
  const query = c.req.valid("query");

  const result = await getAuditLogs({
    workspaceId,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
    actorUserId: query.actorUserId,
    action: query.action,
    entityType: query.entityType,
    cursor: query.cursor,
    limit: query.limit,
  });

  return c.json(result);
});

export default app;
