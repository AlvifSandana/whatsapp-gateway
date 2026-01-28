import { z } from 'zod';

export const contactUpdateSchema = z.object({
    displayName: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
});

export const contactTagsUpdateSchema = z.object({
    tagIds: z.array(z.string().uuid()).optional(),
});

export const bulkDeleteSchema = z.object({
    ids: z.array(z.string().uuid()),
});

export const bulkTagsUpdateSchema = z.object({
    ids: z.array(z.string().uuid()),
    tagIds: z.array(z.string().uuid()),
    mode: z.enum(['add', 'remove']),
});
