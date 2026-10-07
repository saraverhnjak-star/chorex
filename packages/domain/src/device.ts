import { z } from 'zod';

// Self-owned auxiliary registration metadata; timestamps are supplied by the adapter.
export const pushDeviceMetadataSchema = z.strictObject({
  platform: z.enum(['ios', 'android']),
  appVariant: z.enum(['PARENT', 'CHILD']),
  appVersion: z.string().trim().min(1).max(64),
  expoPushToken: z
    .string()
    .max(512)
    .regex(/^(ExponentPushToken|ExpoPushToken)\[[^\s]+\]$/u),
  pushEnabled: z.literal(true),
});
export type PushDeviceMetadata = z.infer<typeof pushDeviceMetadataSchema>;
