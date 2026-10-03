import { z } from 'zod';
import { idempotencyKeySchema, utcIsoDateTimeSchema } from './family';

export const pairingSessionTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{22}$/);

export const createPairingSessionInputSchema = z.strictObject({
  familyId: z.string().trim().min(1),
  childUid: z.string().trim().min(1),
  idempotencyKey: idempotencyKeySchema,
});

export const createPairingSessionOutputSchema = z.strictObject({
  sessionId: z.string().min(1),
  expiresAt: utcIsoDateTimeSchema,
  token: pairingSessionTokenSchema.optional(),
});

export const pairingCommandErrorCodes = {
  authRequired: 'AUTH_REQUIRED',
  invalidInput: 'INVALID_INPUT',
  familyMembershipRequired: 'FAMILY_MEMBERSHIP_REQUIRED',
  wrongActorRole: 'WRONG_ACTOR_ROLE',
  childMembershipRequired: 'CHILD_MEMBERSHIP_REQUIRED',
  idempotencyConflict: 'IDEMPOTENCY_CONFLICT',
} as const;

export type CreatePairingSessionInput = z.output<
  typeof createPairingSessionInputSchema
>;
export type CreatePairingSessionInputValue = z.input<
  typeof createPairingSessionInputSchema
>;
export type CreatePairingSessionOutput = z.output<
  typeof createPairingSessionOutputSchema
>;
export type PairingCommandErrorCode =
  (typeof pairingCommandErrorCodes)[keyof typeof pairingCommandErrorCodes];
