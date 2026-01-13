import { prisma } from "@repo/db";
import { WASocket } from "@whiskeysockets/baileys";
import pino from "pino";
import crypto from "crypto";
import dns from "dns/promises";
import RE2 from "re2";
import { redis } from "../redis";
import { config } from "../config";

type IncomingMessage = {
    remoteJid: string;
    text: string;
    waAccountId: string;
    participant?: string;
};

type TimeWindow = {
    start: string;
    end: string;
    days?: number[];
    timeZone?: string;
};

type WebhookAction = {
    type: string;
    text?: string;
};

export class AutoReplyService {
    constructor(private logger: pino.Logger) { }

    private normalizeText(text: string) {
        return text.toLowerCase().trim().replace(/\s+/g, " ");
    }

    private parseMinutes(value: string) {
        const [h, m] = value.split(":").map(Number);
        if (Number.isNaN(h) || Number.isNaN(m)) return null;
        return h * 60 + m;
    }

    private getTimeParts(timeZone?: string) {
        const formatter = new Intl.DateTimeFormat("en-US", {
            timeZone,
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            weekday: "short",
        });
        const parts = formatter.formatToParts(new Date());
        const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
        const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
        const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
        return { hour, minute, weekday };
    }

    private isWithinTimeWindow(window?: TimeWindow | null) {
        if (!window?.start || !window?.end) return true;
        const start = this.parseMinutes(window.start);
        const end = this.parseMinutes(window.end);
        if (start === null || end === null) return true;

        const { hour, minute, weekday } = this.getTimeParts(window.timeZone);
        const now = hour * 60 + minute;

        if (window.days && window.days.length > 0) {
            const dayMap: Record<string, number> = {
                Sun: 0,
                Mon: 1,
                Tue: 2,
                Wed: 3,
                Thu: 4,
                Fri: 5,
                Sat: 6,
            };
            const day = dayMap[weekday];
            if (day === undefined || !window.days.includes(day)) return false;
        }

        if (start <= end) {
            return now >= start && now <= end;
        }
        // Overnight window (e.g., 22:00 - 06:00)
        return now >= start || now <= end;
    }

    private isPrivateIp(ip: string) {
        if (ip === "127.0.0.1" || ip === "::1") return true;
        if (ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("172.")) {
            const second = Number(ip.split(".")[1]);
            if (second >= 16 && second <= 31) return true;
        }
        if (ip.startsWith("169.254.")) return true;
        if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) return true;
        return false;
    }

    private isWebhookAllowed(url: URL) {
        if (url.protocol !== "http:" && url.protocol !== "https:") return false;
        const allowlist = config.autoReplyWebhookAllowlist;
        if (allowlist.length === 0) return true;
        return allowlist.includes(url.hostname);
    }

    private async isSafeHostname(hostname: string) {
        if (hostname === "localhost") return false;
        try {
            const lookups = await dns.lookup(hostname, { all: true });
            return !lookups.some((entry) => this.isPrivateIp(entry.address));
        } catch {
            return false;
        }
    }

    private async callWebhook(rule: any, msg: IncomingMessage) {
        if (!rule.webhookUrl) return [];
        let url: URL;
        try {
            url = new URL(rule.webhookUrl);
        } catch {
            this.logger.warn({ ruleId: rule.id }, "Invalid webhook URL");
            return [];
        }

        if (!this.isWebhookAllowed(url)) {
            this.logger.warn({ ruleId: rule.id }, "Webhook hostname not allowlisted");
            return [];
        }

        const safe = await this.isSafeHostname(url.hostname);
        if (!safe) {
            this.logger.warn({ ruleId: rule.id }, "Webhook hostname resolves to private IP");
            return [];
        }

        const payload = {
            ruleId: rule.id,
            waAccountId: msg.waAccountId,
            remoteJid: msg.remoteJid,
            participant: msg.participant,
            text: msg.text,
            timestamp: new Date().toISOString(),
        };
        const body = JSON.stringify(payload);
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        if (rule.webhookSecret) {
            const ts = Date.now().toString();
            const signature = crypto
                .createHmac("sha256", rule.webhookSecret)
                .update(`${ts}.${body}`)
                .digest("hex");
            headers["x-timestamp"] = ts;
            headers["x-signature"] = signature;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), config.autoReplyWebhookTimeoutMs);
        try {
            const res = await fetch(rule.webhookUrl, {
                method: "POST",
                headers,
                body,
                signal: controller.signal,
                redirect: "error",
            });
            clearTimeout(timeout);
            if (!res.ok) return [];
            const json = await res.json().catch(() => null);
            const actions: WebhookAction[] = Array.isArray(json?.actions) ? json.actions : [];
            const valid = actions
                .filter((action) => action && action.type === "text" && typeof action.text === "string")
                .map((action) => ({
                    type: "text",
                    text: String(action.text).slice(0, config.autoReplyWebhookMaxTextLength),
                }))
                .filter((action) => action.text.trim().length > 0);
            return valid.slice(0, config.autoReplyWebhookMaxActions);
        } catch (err) {
            clearTimeout(timeout);
            this.logger.warn({ ruleId: rule.id, err }, "Webhook call failed");
            return [];
        }
    }

    private async canSendToSender(remoteJid: string) {
        const limit = config.autoReplySenderLimit;
        const windowSeconds = config.autoReplySenderWindowSeconds;
        if (!limit || limit <= 0) return true;

        const key = `auto-reply:sender:${remoteJid}`;
        const count = await redis.incr(key);
        if (count === 1 && windowSeconds > 0) {
            await redis.expire(key, windowSeconds);
        }
        return count <= limit;
    }

    async handleMessage(sock: WASocket, msg: IncomingMessage) {
        if (!msg.text) return;

        // Fetch rules for this account + workspace
        // Optimization: Cache rules in Redis or Memory
        const account = await prisma.waAccount.findUnique({
            where: { id: msg.waAccountId },
            select: { workspaceId: true }
        });

        if (!account) return;

        const rules = await prisma.autoReplyRule.findMany({
            where: {
                workspaceId: account.workspaceId,
                isActive: true,
                OR: [
                    { waAccountId: null },
                    { waAccountId: msg.waAccountId }
                ]
            },
            orderBy: { priority: "desc" }
        });

        for (const rule of rules) {
            let match = false;
            const text = this.normalizeText(msg.text);
            const pattern = this.normalizeText(rule.patternValue);

            if (!this.isWithinTimeWindow(rule.timeWindow as TimeWindow | null)) {
                continue;
            }

            if (rule.patternType === "KEYWORD") {
                match = text === pattern;
            } else if (rule.patternType === "CONTAINS") {
                match = text.includes(pattern);
            } else if (rule.patternType === "REGEX") {
                try {
                    const patternValue = String(rule.patternValue || "");
                    if (patternValue.length > config.autoReplyRegexMaxLength) {
                        this.logger.warn({ ruleId: rule.id }, "Regex pattern too long");
                    } else {
                        const regex = new RE2(patternValue, "i");
                        match = regex.test(msg.text);
                    }
                } catch (e) {
                    this.logger.error({ ruleId: rule.id }, "Invalid Regex");
                }
            }

            if (match) {
                if (rule.cooldownSeconds && rule.cooldownSeconds > 0) {
                    const key = `cooldown:auto-reply:${rule.id}:${msg.remoteJid}`;
                    const exists = await redis.get(key);
                    if (exists) continue;
                }
                const allowed = await this.canSendToSender(msg.remoteJid);
                if (!allowed) {
                    this.logger.info({ ruleId: rule.id, to: msg.remoteJid }, "Auto-reply rate limited");
                    return;
                }

                // Reply
                if (rule.replyMode === "STATIC" && rule.replyPayload) {
                    // Check if payload is valid
                    const payload = rule.replyPayload as any;
                    if (payload.text) {
                        await sock.sendMessage(msg.remoteJid, { text: payload.text });
                        this.logger.info({ ruleId: rule.id, to: msg.remoteJid }, "Auto-replied");
                        if (rule.cooldownSeconds && rule.cooldownSeconds > 0) {
                            await redis.set(
                                `cooldown:auto-reply:${rule.id}:${msg.remoteJid}`,
                                "1",
                                "EX",
                                rule.cooldownSeconds,
                            );
                        }
                        // Stop processing lower priority?
                        return; // Assume we stop after first match
                    }
                }

                if (rule.replyMode === "WEBHOOK") {
                    const actions = await this.callWebhook(rule, msg);
                    let sentCount = 0;
                    for (const action of actions) {
                        if (action?.type === "text" && action.text) {
                            await sock.sendMessage(msg.remoteJid, { text: String(action.text) });
                            sentCount += 1;
                        }
                    }
                    if (sentCount > 0 && rule.cooldownSeconds && rule.cooldownSeconds > 0) {
                        await redis.set(
                            `cooldown:auto-reply:${rule.id}:${msg.remoteJid}`,
                            "1",
                            "EX",
                            rule.cooldownSeconds,
                        );
                    }
                    if (sentCount > 0) {
                        this.logger.info({ ruleId: rule.id, to: msg.remoteJid }, "Auto-replied via webhook");
                        return;
                    }
                }
            }
        }
    }
}
