import {
    AuthenticationCreds,
    AuthenticationState,
    BufferJSON,
    initAuthCreds,
    SignalDataTypeMap,
    proto,
} from "@whiskeysockets/baileys";
import { prisma } from "@repo/db";
import pino from "pino";

export const usePostgresAuthState = async (
    waAccountId: string,
    logger: pino.Logger
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> => {
    const saveCreds = async () => {
        // This is handled by the writer functions below, Baileys calls them
    };

    // Load creds
    let creds: AuthenticationCreds;
    const session = await prisma.waAccountSession.findUnique({
        where: { waAccountId },
    });

    if (session && session.credsEnc) {
        // Prisma Bytes is Uint8Array or Buffer. Safe to wrap in Buffer.from()
        creds = JSON.parse(
            Buffer.from(session.credsEnc).toString("utf-8"),
            BufferJSON.reviver
        );
    } else {
        creds = initAuthCreds();
    }

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const data: { [key: string]: any } = {};

                    // Optimize: fetch all needed keys in one query
                    const dbKeys = await prisma.waAccountKey.findMany({
                        where: {
                            waAccountId,
                            category: type,
                            keyId: { in: ids },
                        },
                    });

                    for (const k of dbKeys) {
                        if (k.valueEnc) {
                            data[k.keyId] = JSON.parse(
                                Buffer.from(k.valueEnc).toString("utf-8"),
                                BufferJSON.reviver
                            );
                        }
                    }
                    return data;
                },
                set: async (data) => {
                    const tasks: Promise<any>[] = [];

                    for (const category in data) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const catData = data[category as keyof typeof data] as { [key: string]: any };

                        for (const keyId in catData) {
                            const value = catData[keyId];

                            if (value) {
                                // Upsert key
                                tasks.push(
                                    prisma.waAccountKey.upsert({
                                        where: {
                                            waAccountId_category_keyId: {
                                                waAccountId,
                                                category,
                                                keyId
                                            }
                                        },
                                        create: {
                                            waAccountId,
                                            workspaceId: session?.workspaceId || "UNKNOWN",
                                            category,
                                            keyId,
                                            valueEnc: Buffer.from(JSON.stringify(value, BufferJSON.replacer), "utf-8")
                                        },
                                        update: {
                                            valueEnc: Buffer.from(JSON.stringify(value, BufferJSON.replacer), "utf-8")
                                        }
                                    })
                                )
                            } else {
                                // Delete key
                                tasks.push(
                                    prisma.waAccountKey.deleteMany({
                                        where: {
                                            waAccountId,
                                            category,
                                            keyId
                                        }
                                    })
                                )
                            }
                        }
                    }
                    await Promise.all(tasks);
                },
            },
        },
        saveCreds: async () => {
            const account = await prisma.waAccount.findUnique({ where: { id: waAccountId } });
            if (!account) throw new Error("WA Account not found");

            await prisma.waAccountSession.upsert({
                where: { waAccountId },
                create: {
                    waAccountId,
                    workspaceId: account.workspaceId,
                    credsEnc: Buffer.from(JSON.stringify(creds, BufferJSON.replacer), "utf-8"),
                },
                update: {
                    credsEnc: Buffer.from(JSON.stringify(creds, BufferJSON.replacer), "utf-8"),
                },
            });
        },
    };
};
