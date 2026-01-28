import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import request from 'supertest';
import waAccountRouter from '../wa-accounts';
import { prisma } from '@repo/db';

vi.mock('@repo/db', () => ({
    prisma: {
        waAccount: {
            findMany: vi.fn(),
            findFirst: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            count: vi.fn(),
        },
        message: {
            count: vi.fn(),
        },
        campaign: {
            count: vi.fn(),
        },
        autoReplyRule: {
            count: vi.fn(),
        }
    },
}));

vi.mock('../../redis', () => ({
    redis: {
        get: vi.fn(),
        mget: vi.fn(),
    },
    pubSubPublisher: {
        publish: vi.fn(),
    }
}));

vi.mock('@repo/shared', () => ({
    logAudit: vi.fn(),
}));

describe('WA Accounts Route', () => {
    let app: Hono;

    beforeEach(() => {
        app = new Hono();
        app.use('*', async (c, next) => {
            c.set('auth', { workspaceId: 'test-workspace-id', userId: 'test-user-id' });
            await next();
        });
        app.route('/v1/wa-accounts', waAccountRouter);
        vi.clearAllMocks();
    });

    it('GET /v1/wa-accounts returns accounts', async () => {
        const mockAccounts = [{ id: 'wa-1', phoneE164: '+628123456789', workspaceId: 'test-workspace-id' }];
        (prisma.waAccount.findMany as any).mockResolvedValue(mockAccounts);

        const res = await request(app.fetch).get('/v1/wa-accounts');

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual(mockAccounts);
    });

    it('POST /v1/wa-accounts creates a new account', async () => {
        const newAccount = { phoneE164: '+628123456789', label: 'Main Account' };
        const createdAccount = { id: 'wa-2', ...newAccount, status: 'DISCONNECTED' };
        (prisma.waAccount.create as any).mockResolvedValue(createdAccount);

        const res = await request(app.fetch)
            .post('/v1/wa-accounts')
            .send(newAccount);

        expect(res.status).toBe(201);
        expect(res.body.data).toEqual(createdAccount);
    });

    it('DELETE /v1/wa-accounts/:id returns 409 if related records exist', async () => {
        (prisma.waAccount.findFirst as any).mockResolvedValue({ id: 'wa-1', workspaceId: 'test-workspace-id' });
        (prisma.message.count as any).mockResolvedValue(10);
        (prisma.campaign.count as any).mockResolvedValue(0);
        (prisma.autoReplyRule.count as any).mockResolvedValue(0);

        const res = await request(app.fetch).delete('/v1/wa-accounts/wa-1');

        expect(res.status).toBe(409);
        expect(res.body.error).toContain('Cannot delete account with related records');
    });
});
