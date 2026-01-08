import { Hono } from "hono";
import { prisma } from "@repo/db";
import { parse } from "csv-parse";
import { z } from "zod";

const app = new Hono();

// List Contacts
app.get("/", async (c) => {
    const contacts = await prisma.contact.findMany({
        orderBy: { createdAt: "desc" },
        include: { tags: { include: { tag: true } } }
    });
    return c.json({ data: contacts });
});

// Import Contacts
app.post("/import", async (c) => {
    const body = await c.req.parseBody();
    const file = body["file"];

    if (!file || !(file instanceof File)) {
        return c.json({ error: "No file uploaded" }, 400);
    }

    const text = await file.text();
    const contactsToInsert: any[] = [];

    // We assume a simple CSV structure: name,phone,email,tags(comma-sep)
    // Using a promise wrapper for csv-parse
    await new Promise((resolve, reject) => {
        parse(text, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        }, (err, records) => {
            if (err) reject(err);
            else {
                records.forEach((record: any) => {
                    if (record.phone) {
                        contactsToInsert.push({
                            name: record.name,
                            phone: record.phone, // In real app, validate/sanitize E164
                            email: record.email || null,
                            tags: record.tags ? record.tags.split(",").map((t: string) => t.trim()) : []
                        });
                    }
                });
                resolve(records);
            }
        });
    });

    const workspaceId = c.req.header("X-Workspace-ID") || "00000000-0000-0000-0000-000000000000"; // Fallback/TODO

    // Process insertions
    // Ideally use createMany, but tags require connectOrCreate which is not supported in createMany.
    // So we iterate. (Slow for large files, use transaction or job queue for prod)

    let count = 0;
    try {
        await prisma.$transaction(
            contactsToInsert.map(contact => {
                return prisma.contact.upsert({
                    where: {
                        workspaceId_phoneE164: {
                            workspaceId,
                            phoneE164: contact.phone
                        }
                    },
                    create: {
                        workspaceId,
                        phoneE164: contact.phone,
                        displayName: contact.name,
                        // email: null, // Schema doesn't have email for Contact? Checking schema... 
                        // Wait, schema for Contact: id, workspaceId, phoneE164, displayName, notes. NO EMAIL.
                        // I need to check if I should add email or drop it.
                        // Specs said "Contact Management (csv import)".
                        // Schema I generated in Phase 1 (lines 93-109 in viewed file) DOES NOT HAVE EMAIL.
                        // I will drop email for now to stick to schema.
                        tags: {
                            create: contact.tags.map((tagName: string) => ({
                                tag: {
                                    connectOrCreate: {
                                        where: { workspaceId_name: { workspaceId, name: tagName } },
                                        create: { workspaceId, name: tagName }
                                        // Tag model: id, workspaceId, name, createdAt. NO COLOR.
                                    }
                                }
                            }))
                        }
                    },
                    update: {
                        displayName: contact.name,
                        // email: contact.email 
                        // Update tags? Merging tags is complex. Let's just keep existing or simple append.
                        // For MVP, if it exists, we update name/email.
                    }
                })
            })
        );
        count = contactsToInsert.length;
    } catch (e) {
        console.error(e);
        return c.json({ error: "Import failed" }, 500);
    }

    return c.json({ message: "Imported successfully", count });
});

export default app;
