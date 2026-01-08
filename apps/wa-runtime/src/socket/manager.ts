import makeWASocket, {
    DisconnectReason,
    WASocket,
    fetchLatestBaileysVersion,
    isJidBroadcast,
    makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";
import { redis, pubSubPublisher } from "../redis";
import { prisma } from "@repo/db";
import { usePostgresAuthState } from "../store/auth";
import pino from "pino";
import { config } from "../config";
import QRCode from "qrcode-terminal";
import { AutoReplyService } from "../services/auto-reply";

const logger = pino({ level: config.logLevel });

export class SocketManager {
    private sockets: Map<string, WASocket> = new Map();

    private async publishEvent(type: string, payload: any) {
        const event = { type, payload, timestamp: new Date().toISOString() };
        await pubSubPublisher.publish("ev:wa-runtime", JSON.stringify(event));
    }

    async sendMessage(waAccountId: string, to: string, message: any, dbMessageId?: string) {
        const sock = this.sockets.get(waAccountId);
        if (!sock) {
            logger.error({ waAccountId }, "Socket not found for sending");
            if (dbMessageId) {
                await prisma.message.update({ where: { id: dbMessageId }, data: { status: "FAILED", errorCode: "NO_SOCKET" } });
            }
            return;
        }

        try {
            let content: any = {};
            if (message.type === 'text') {
                content = { text: message.text };
            } else {
                // Fallback / straight pass
                content = message;
            }

            const sent = await sock.sendMessage(to + "@s.whatsapp.net", content);

            if (dbMessageId) {
                await prisma.message.update({
                    where: { id: dbMessageId },
                    data: {
                        status: "SENT",
                        providerMsgId: sent?.key.id,
                    }
                });
                await prisma.messageEvent.create({
                    data: { messageId: dbMessageId, event: "SENT" }
                });
            }
        } catch (e) {
            logger.error({ waAccountId, err: e }, "Failed to send message");
            if (dbMessageId) {
                await prisma.message.update({ where: { id: dbMessageId }, data: { status: "FAILED", errorMessage: String(e) } });
            }
        }
    }

    async start(waAccountId: string) {
        if (this.sockets.has(waAccountId)) {
            logger.warn({ waAccountId }, "Socket already started");
            return;
        }

        logger.info({ waAccountId }, "Starting socket");

        // Lock check (simple implementation)
        // Real implementation should be robust with TTL and keep-alive
        const locked = await redis.setnx(`lock:wa:${waAccountId}`, "1");
        if (!locked) {
            logger.warn({ waAccountId }, "Could not acquire lock, another instance running?");
            // In robust production, check if lock is stale
            // return; 
            // For MVP/Dev, we might want to force or verify expiry.
            // Let's assume redis TTL is set by the owner.
        }
        await redis.expire(`lock:wa:${waAccountId}`, 30); // 30s TTL

        const { state, saveCreds } = await usePostgresAuthState(waAccountId, logger);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            logger: logger.child({ waAccountId }) as any, // Baileys logger type mismatch hack
            printQRInTerminal: false, // We handle QR manually
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger.child({ waAccountId }) as any),
            },
            browser: ["WaGateway", "Chrome", "1.0.0"],
            generateHighQualityLinkPreview: true,
            shouldIgnoreJid: (jid) => isJidBroadcast(jid) || jid.endsWith("@newsletter"),
        });

        this.sockets.set(waAccountId, sock);

        sock.ev.on("creds.update", saveCreds);

        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                logger.info({ waAccountId }, "QR Code received");
                // QRCode.generate(qr, { small: true }); // Debug to terminal
                // Publish QR to Redis for UI
                await redis.set(`wa:qr:${waAccountId}`, qr, "EX", 60);

                // Publish Event
                await this.publishEvent("numbers.status", {
                    waAccountId,
                    status: "QR_READY",
                    qr
                });

                // Update DB status?
                await prisma.waAccount.update({
                    where: { id: waAccountId },
                    data: { status: "QR_READY" }
                });
            }

            if (connection === "close") {
                const reason = (lastDisconnect?.error as any)?.output?.statusCode;
                logger.warn({ waAccountId, reason }, "Connection closed");

                // Remove lock
                await redis.del(`lock:wa:${waAccountId}`);
                this.sockets.delete(waAccountId);

                // Update DB
                await prisma.waAccount.update({
                    where: { id: waAccountId },
                    data: { status: "DISCONNECTED", lastSeenAt: new Date() }
                });

                await this.publishEvent("numbers.status", {
                    waAccountId,
                    status: "DISCONNECTED",
                    reason
                });

                if (reason !== DisconnectReason.loggedOut) {
                    // Reconnect logic
                    // In a real runner, we might use a queue or backoff
                    logger.info("Reconnecting...");
                    setTimeout(() => this.start(waAccountId), 3000);
                } else {
                    logger.error("Logged out. Manual intervention required.");
                    // Potentially clear creds?
                }
            } else if (connection === "open") {
                logger.info({ waAccountId }, "Connection opened");

                // Refresh lock loop
                const lockInterval = setInterval(async () => {
                    if (!this.sockets.has(waAccountId)) {
                        clearInterval(lockInterval);
                        return;
                    }
                    await redis.expire(`lock:wa:${waAccountId}`, 30);
                }, 10_000);

                // Update DB
                await prisma.waAccount.update({
                    where: { id: waAccountId },
                    data: { status: "CONNECTED", lastSeenAt: new Date() }
                });

                await this.publishEvent("numbers.status", {
                    waAccountId,
                    status: "CONNECTED"
                });
            }
        });

        // Receive Messages
        sock.ev.on("messages.upsert", async ({ messages, type }) => {
            if (type !== "notify") return;

            for (const msg of messages) {
                if (!msg.message || msg.key.fromMe) continue;

                const remoteJid = msg.key.remoteJid;
                if (!remoteJid || isJidBroadcast(remoteJid)) continue;

                // Extract text
                const text = msg.message.conversation ||
                    msg.message.extendedTextMessage?.text ||
                    msg.message.imageMessage?.caption || "";

                if (text) {
                    const autoReply = new AutoReplyService(logger);
                    await autoReply.handleMessage(sock, {
                        waAccountId,
                        remoteJid,
                        text,
                        participant: msg.key.participant || undefined
                    });
                }
            }
        });
    }

    async stop(waAccountId: string) {
        const sock = this.sockets.get(waAccountId);
        if (sock) {
            sock.end(undefined);
            this.sockets.delete(waAccountId);
            await redis.del(`lock:wa:${waAccountId}`);
        }
    }
}

export const socketManager = new SocketManager();
