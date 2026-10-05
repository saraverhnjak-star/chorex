import { z } from 'zod';
import { contractSchema, contractTaskSchema } from './contract';
import {
  familyCommandErrorCodes,
  idempotencyKeySchema,
  utcIsoDateTimeSchema,
} from './family';
import { offerValidationBounds, taskTermsSchema } from './offer';

const documentIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(offerValidationBounds.idMaxLength)
  .refine((id) => !id.includes('/'), 'Expected one document ID.');
export const taskCompletionSchema = z.strictObject({
  id: documentIdSchema,
  familyId: documentIdSchema,
  contractId: documentIdSchema,
  taskId: documentIdSchema,
  childUid: documentIdSchema,
  ordinal: z.number().int().min(1).max(offerValidationBounds.targetCountMax),
  note: taskTermsSchema.shape.description,
  createdAt: utcIsoDateTimeSchema,
});
export const recordTaskCompletionInputSchema = z.strictObject({
  contractId: documentIdSchema,
  taskId: documentIdSchema,
  idempotencyKey: idempotencyKeySchema,
});
export const recordTaskCompletionOutputSchema = z
  .strictObject({
    completion: taskCompletionSchema,
    task: contractTaskSchema,
  })
  .superRefine(({ completion, task }, context) => {
    if (
      completion.familyId !== task.familyId ||
      completion.contractId !== task.contractId ||
      completion.taskId !== task.id ||
      completion.childUid !== task.assigneeUid ||
      completion.ordinal !== task.completedCount ||
      completion.createdAt !== task.lastCompletedAt ||
      completion.createdAt !== task.updatedAt
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Completion must identify the committed task projection.',
        path: ['completion'],
      });
    }
  });
export const contractCommandErrorCodes = {
  ...familyCommandErrorCodes,
  forbidden: 'FORBIDDEN',
  invalidState: 'INVALID_STATE',
  contractNotFound: 'CONTRACT_NOT_FOUND',
  taskNotFound: 'TASK_NOT_FOUND',
  taskAlreadyComplete: 'TASK_ALREADY_COMPLETE',
  tasksIncomplete: 'TASKS_INCOMPLETE',
} as const;
export type ContractCommandErrorCode =
  (typeof contractCommandErrorCodes)[keyof typeof contractCommandErrorCodes];
export type TaskCompletion = z.output<typeof taskCompletionSchema>;
export type RecordTaskCompletionInput = z.output<
  typeof recordTaskCompletionInputSchema
>;
export type RecordTaskCompletionInputValue = z.input<
  typeof recordTaskCompletionInputSchema
>;
export type RecordTaskCompletionOutput = z.output<
  typeof recordTaskCompletionOutputSchema
>;

export const submitContractForReviewInputSchema = z.strictObject({
  contractId: documentIdSchema,
  idempotencyKey: idempotencyKeySchema,
});
export const submitContractForReviewOutputSchema = z.strictObject({
  contract: contractSchema.extend({ status: z.literal('READY_FOR_REVIEW') }),
});
export type SubmitContractForReviewInput = z.output<
  typeof submitContractForReviewInputSchema
>;
export type SubmitContractForReviewInputValue = z.input<
  typeof submitContractForReviewInputSchema
>;
export type SubmitContractForReviewOutput = z.output<
  typeof submitContractForReviewOutputSchema
>;
