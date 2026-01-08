import { prisma } from "@repo/db";
import { WASocket } from "@whiskeysockets/baileys";
import pino from "pino";

type IncomingMessage = {
    remoteJid: string;
    text: string;
    waAccountId: string;
    participant?: string;
};

export class AutoReplyService {
    constructor(private logger: pino.Logger) { }

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
            const text = msg.text.toLowerCase();
            const pattern = rule.patternValue.toLowerCase();

            if (rule.patternType === "KEYWORD") {
                match = text === pattern;
            } else if (rule.patternType === "CONTAINS") {
                match = text.includes(pattern);
            } else if (rule.patternType === "REGEX") {
                try {
                    const regex = new RegExp(rule.patternValue, 'i');
                    match = regex.test(msg.text);
                } catch (e) {
                    this.logger.error({ ruleId: rule.id }, "Invalid Regex");
                }
            }

            if (match) {
                // Check cooldown? (skip for MVP)

                // Reply
                if (rule.replyMode === "STATIC" && rule.replyPayload) {
                    // Check if payload is valid
                    const payload = rule.replyPayload as any;
                    if (payload.text) {
                        await sock.sendMessage(msg.remoteJid, { text: payload.text });
                        this.logger.info({ ruleId: rule.id, to: msg.remoteJid }, "Auto-replied");
                        // Stop processing lower priority?
                        return; // Assume we stop after first match
                    }
                }

                // Webhook logic would go here
            }
        }
    }
}
