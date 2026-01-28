import { z } from 'zod';

export const waAccountCreateSchema = z.object({
    phoneE164: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format (E.164)'),
    label: z.string().optional(),
});

export const waAccountUpdateSchema = z.object({
    label: z.string().nullable().optional(),
});
