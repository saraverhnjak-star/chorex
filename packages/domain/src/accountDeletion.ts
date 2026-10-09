import { z } from 'zod';
import { idempotencyKeySchema } from './family';
export const deleteParentAccountInputSchema = z.strictObject({
  idempotencyKey: idempotencyKeySchema,
  confirmation: z.literal('DELETE_ACCOUNT_AND_FAMILY'),
});
export const accountDeletionOutputSchema = z.strictObject({
  status: z.enum(['PENDING', 'COMPLETE']),
});
export const accountDeletionErrorCodes = {
  authRequired: 'AUTH_REQUIRED',
  invalidInput: 'INVALID_INPUT',
  wrongActorRole: 'WRONG_ACTOR_ROLE',
  recentAuthRequired: 'RECENT_AUTH_REQUIRED',
  unsupportedScope: 'ACCOUNT_DELETION_SCOPE_UNSUPPORTED',
  deletionInProgress: 'ACCOUNT_DELETION_IN_PROGRESS',
  idempotencyConflict: 'IDEMPOTENCY_CONFLICT',
} as const;
export type AccountDeletionErrorCode =
  (typeof accountDeletionErrorCodes)[keyof typeof accountDeletionErrorCodes];
export type DeleteParentAccountInput = z.output<
  typeof deleteParentAccountInputSchema
>;
export type AccountDeletionOutput = z.output<
  typeof accountDeletionOutputSchema
>;
