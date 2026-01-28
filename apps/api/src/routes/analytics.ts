import { Hono } from "hono";
import { prisma } from "@repo/db";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

const app = new Hono();

const querySchema = z.object({
    days: z.string().optional().transform(v => parseInt(v || "7")),
});

app.get("/daily", zValidator("query", querySchema), async (c) => {
    const auth = c.get("auth") as any;
    const { days } = c.req.valid("query");

    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - days);
    startDate.setUTCHours(0, 0, 0, 0);

    const stats = await prisma.dailyAnalytics.findMany({
        where: {
            workspaceId: auth.workspaceId,
            date: { gte: startDate },
        },
        orderBy: { date: "asc" },
    });

    return c.json({ data: stats });
});

app.get("/summary", async (c) => {
    const auth = c.get("auth") as any;

    const totals = await prisma.dailyAnalytics.aggregate({
        where: { workspaceId: auth.workspaceId },
        _sum: {
            sentCount: true,
            failedCount: true,
            deliveredCount: true,
            readCount: true,
        },
    });

    return c.json({
        data: {
            sent: totals._sum.sentCount || 0,
            failed: totals._sum.failedCount || 0,
            delivered: totals._sum.deliveredCount || 0,
            read: totals._sum.readCount || 0,
        }
    });
});

export default app;
