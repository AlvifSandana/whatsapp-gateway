import { z } from 'zod';

export const campaignCreateSchema = z.object({
    name: z.string().min(1, 'Campaign name is required'),
    waAccountId: z.string().uuid().optional(),
    message: z.string().min(1, 'Message is required'),
    tagIds: z.array(z.string().uuid()).optional(),
    contactIds: z.array(z.string().uuid()).optional(),
    scheduleAt: z.string().datetime().optional(),
});

export const campaignUpdateSchema = campaignCreateSchema.partial().extend({
    // Specific update rules if any
});

export const campaignTargetPreviewSchema = z.object({
    tagIds: z.array(z.string().uuid()).optional(),
    contactIds: z.array(z.string().uuid()).optional(),
});
