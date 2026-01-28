import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import request from 'supertest';
import campaignRouter from '../campaigns';
import { prisma } from '@repo/db';

vi.mock('@repo/db', () => ({
    prisma: {
        campaign: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        waAccount: {
            findFirst: vi.fn(),
        },
        campaignTarget: {
            deleteMany: vi.fn(),
            createMany: vi.fn(),
            count: vi.fn(),
            groupBy: vi.fn(),
        },
        contact: {
            findMany: vi.fn(),
            count: vi.fn(),
        },
        auditLog: {
            create: vi.fn(),
        }
    },
}));

vi.mock('@repo/shared', () => ({
    logAudit: vi.fn(),
}));

describe('Campaigns Route', () => {
    let app: Hono;

    beforeEach(() => {
        app = new Hono();
        // Simplified auth middleware mock
        app.use('*', async (c, next) => {
            c.set('auth', { workspaceId: 'test-workspace-id', userId: 'test-user-id' });
            await next();
        });
        app.route('/v1/campaigns', campaignRouter);
    });

    it('GET /v1/campaigns returns campaigns for workspace', async () => {
        const mockCampaigns = [{ id: '1', name: 'Test Campaign', workspaceId: 'test-workspace-id' }];
        (prisma.campaign.findMany as any).mockResolvedValue(mockCampaigns);

        const res = await request(app.fetch).get('/v1/campaigns');

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual(mockCampaigns);
        expect(prisma.campaign.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { workspaceId: 'test-workspace-id' }
        }));
    });

    it('POST /v1/campaigns creates a new campaign', async () => {
        const newCampaign = {
            name: 'New Campaign',
            message: 'Hello!',
        };
        const createdCampaign = { id: '2', ...newCampaign, status: 'DRAFT' };
        (prisma.campaign.create as any).mockResolvedValue(createdCampaign);

        const res = await request(app.fetch)
            .post('/v1/campaigns')
            .send(newCampaign);

        expect(res.status).toBe(201);
        expect(res.body.data).toEqual(createdCampaign);
    });
});
