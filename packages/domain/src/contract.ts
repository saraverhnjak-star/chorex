import { z } from 'zod';
import { idempotencyKeySchema, utcIsoDateTimeSchema } from './family';
import {
  offerSchema,
  offerValidationBounds,
  rewardTermsSchema,
  taskTermsSchema,
} from './offer';

const boundedIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(offerValidationBounds.idMaxLength);

export const contractStatusSchema = z.enum([
  'ACTIVE',
  'READY_FOR_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'CANCELLED',
  'EXPIRED',
]);

export const contractSourceSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('OFFER'),
    offerId: boundedIdSchema,
    revisionId: boundedIdSchema,
  }),
  z.strictObject({
    type: z.literal('AUCTION'),
    auctionId: boundedIdSchema,
    bidId: boundedIdSchema,
  }),
]);

export const contractSchema = z.strictObject({
  id: boundedIdSchema,
  familyId: boundedIdSchema,
  parentUid: boundedIdSchema,
  childUid: boundedIdSchema,
  source: contractSourceSchema,
  rewardTerms: rewardTermsSchema,
  deadlineAt: utcIsoDateTimeSchema,
  status: contractStatusSchema,
  reviewCycle: z.number().int().min(0),
  approvedAt: utcIsoDateTimeSchema.optional(),
  createdAt: utcIsoDateTimeSchema,
  updatedAt: utcIsoDateTimeSchema,
});

export const contractTaskSchema = z
  .strictObject({
    id: boundedIdSchema,
    familyId: boundedIdSchema,
    contractId: boundedIdSchema,
    assigneeUid: boundedIdSchema,
    ...taskTermsSchema.shape,
    completedCount: z
      .number()
      .int()
      .min(0)
      .max(offerValidationBounds.targetCountMax),
    lastCompletedAt: utcIsoDateTimeSchema.optional(),
    createdAt: utcIsoDateTimeSchema,
    updatedAt: utcIsoDateTimeSchema,
  })
  .superRefine(({ completedCount, targetCount }, context) => {
    if (completedCount > targetCount) {
      context.addIssue({
        code: 'custom',
        message: 'Completed count cannot exceed target count.',
        path: ['completedCount'],
      });
    }
  });

export const acceptOfferInputSchema = z.strictObject({
  offerId: boundedIdSchema,
  currentRevisionId: boundedIdSchema,
  idempotencyKey: idempotencyKeySchema,
});

const acceptedOfferSchema = offerSchema.extend({
  status: z.literal('ACCEPTED'),
  currentRevisionId: boundedIdSchema,
});

const activeOfferContractSchema = contractSchema.extend({
  source: z.strictObject({
    type: z.literal('OFFER'),
    offerId: boundedIdSchema,
    revisionId: boundedIdSchema,
  }),
  status: z.literal('ACTIVE'),
  reviewCycle: z.literal(0),
});

export const acceptOfferOutputSchema = z
  .strictObject({
    offer: acceptedOfferSchema,
    contract: activeOfferContractSchema,
    tasks: z
      .array(contractTaskSchema)
      .min(1)
      .max(offerValidationBounds.taskCountMax),
  })
  .superRefine(({ offer, contract, tasks }, context) => {
    if (
      contract.source.offerId !== offer.id ||
      contract.source.revisionId !== offer.currentRevisionId
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Contract source must identify the accepted Offer revision.',
        path: ['contract', 'source'],
      });
    }
    tasks.forEach((task, index) => {
      if (
        task.contractId !== contract.id ||
        task.familyId !== contract.familyId ||
        task.assigneeUid !== contract.childUid
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Contract task must belong to the accepted Contract.',
          path: ['tasks', index],
        });
      }
    });
  });

export type ContractStatus = z.output<typeof contractStatusSchema>;
export type ContractSource = z.output<typeof contractSourceSchema>;
export type Contract = z.output<typeof contractSchema>;
export type ContractTask = z.output<typeof contractTaskSchema>;
export type AcceptOfferInput = z.output<typeof acceptOfferInputSchema>;
export type AcceptOfferInputValue = z.input<typeof acceptOfferInputSchema>;
export type AcceptOfferOutput = z.output<typeof acceptOfferOutputSchema>;
