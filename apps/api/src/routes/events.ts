import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { eventBus } from "../redis";

const app = new Hono();

app.get("/", (c) => {
    return streamSSE(c, async (stream) => {
        const listener = (channel: string, message: string) => {
            // We only care about events relevant to frontend
            // Assuming all published events are JSON
            stream.writeSSE({
                data: message,
                event: "message",
                id: String(Date.now()),
            });
        };

        eventBus.on("message", listener);

        stream.onAbort(() => {
            eventBus.off("message", listener);
        });

        // Keep alive
        while (true) {
            await new Promise((resolve) => setTimeout(resolve, 15000));
            await stream.writeSSE({ event: "ping", data: "pong" });
        }
    });
});

export default app;
