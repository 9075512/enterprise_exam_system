import { z } from 'zod';

export const captureIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/, '照片标识不合法');
export const deleteCapturesSchema = z.object({ captureIds: z.array(captureIdSchema).min(1).max(50) }).strict();

export const captureSettingsSchema = z.object({
  enabled: z.boolean().nullable().default(null),
  intervalMinutes: z.number().int().min(1).max(60).nullable().default(null),
  cameraPolicy: z.enum(['required', 'optional']).nullable().default(null),
}).strict();
export const captureInputSchema = z.object({
  captureId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/, '采集标识不合法'),
  kind: z.enum(['entry', 'periodic', 'resume']).default('periodic'),
});
export const cameraEventSchema = z.object({
  eventId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  status: z.enum(['ready', 'unavailable', 'interrupted', 'upload_failed']),
  reason: z.string().trim().max(255).default(''),
}).strict();
