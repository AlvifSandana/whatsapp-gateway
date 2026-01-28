import { z } from 'zod';

export const timeWindowSchema = z.object({
    start: z.string().regex(/^\d{2}:\d{2}$/, 'Start time must be in HH:mm format'),
    end: z.string().regex(/^\d{2}:\d{2}$/, 'End time must be in HH:mm format'),
    days: z.array(z.number().int().min(0).max(6)).optional(),
    timeZone: z.string().optional(),
});

export const autoReplyCreateSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    waAccountId: z.string().uuid().nullable().optional(),
    isActive: z.boolean().optional(),
    priority: z.number().int().optional(),
    patternType: z.enum(['KEYWORD', 'CONTAINS', 'REGEX']),
    patternValue: z.string().min(1, 'Pattern value is required'),
    replyMode: z.enum(['STATIC', 'WEBHOOK']),
    replyText: z.string().optional(),
    replyPayload: z.unknown().optional(),
    webhookUrl: z.string().url().nullable().optional(),
    webhookSecret: z.string().nullable().optional(),
    cooldownSeconds: z.number().int().min(0).optional(),
    timeWindow: z.union([timeWindowSchema, z.null()]).optional(),
});

export const autoReplyUpdateSchema = autoReplyCreateSchema.partial();

export const autoReplyTestSchema = z.object({
    text: z.string().min(1, 'Text is required'),
});
