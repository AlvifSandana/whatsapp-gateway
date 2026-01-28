import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import request from 'supertest';
import contactsRouter from '../contacts';
import { prisma } from '@repo/db';

vi.mock('@repo/db', () => ({
    prisma: {
        contact: {
            findMany: vi.fn(),
            findFirst: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            count: vi.fn(),
            groupBy: vi.fn(),
            deleteMany: vi.fn(),
        },
        message: {
            count: vi.fn(),
            findMany: vi.fn(),
            groupBy: vi.fn(),
        },
        contactTag: {
            deleteMany: vi.fn(),
            createMany: vi.fn(),
        },
        contactImportJob: {
            create: vi.fn(),
            findUnique: vi.fn(),
            update: vi.fn(),
        }
    },
}));

vi.mock('../../redis', () => ({
    redis: {
        rpush: vi.fn(),
    }
}));

vi.mock('@repo/shared', () => ({
    logAudit: vi.fn(),
}));

describe('Contacts Route', () => {
    let app: Hono;

    beforeEach(() => {
        app = new Hono();
        app.use('*', async (c, next) => {
            c.set('auth', { workspaceId: 'test-workspace-id', userId: 'test-user-id' });
            await next();
        });
        app.route('/v1/contacts', contactsRouter);
        vi.clearAllMocks();
    });

    it('GET /v1/contacts returns contacts', async () => {
        const mockContacts = [{ id: 'c-1', phoneE164: '+628123456789', displayName: 'John Doe', workspaceId: 'test-workspace-id' }];
        (prisma.contact.findMany as any).mockResolvedValue(mockContacts);

        const res = await request(app.fetch).get('/v1/contacts');

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual(mockContacts);
    });

    it('PATCH /v1/contacts/:id updates a contact', async () => {
        (prisma.contact.findFirst as any).mockResolvedValue({ id: 'c-1', workspaceId: 'test-workspace-id' });
        const updatedContact = { id: 'c-1', displayName: 'Jane Doe', workspaceId: 'test-workspace-id' };
        (prisma.contact.update as any).mockResolvedValue(updatedContact);

        const res = await request(app.fetch)
            .patch('/v1/contacts/c-1')
            .send({ displayName: 'Jane Doe' });

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual(updatedContact);
    });

    it('DELETE /v1/contacts/:id returns 409 if contact has messages', async () => {
        (prisma.contact.findFirst as any).mockResolvedValue({ id: 'c-1', workspaceId: 'test-workspace-id' });
        (prisma.message.count as any).mockResolvedValue(5);

        const res = await request(app.fetch).delete('/v1/contacts/c-1');

        expect(res.status).toBe(409);
        expect(res.body.error).toContain('Cannot delete contact with messages');
    });
});
