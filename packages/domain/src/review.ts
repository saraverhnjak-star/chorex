import { z } from 'zod';
import { contractSchema } from './contract';
import { idempotencyKeySchema, utcIsoDateTimeSchema } from './family';
import {
  offerValidationBounds,
  rewardTermsSchema,
  taskTermsSchema,
} from './offer';

const documentId = z
  .string()
  .trim()
  .min(1)
  .max(offerValidationBounds.idMaxLength)
  .refine((id) => !id.includes('/'), 'Expected one document ID.');
export const contractReviewSchema = z.strictObject({
  id: documentId,
  familyId: documentId,
  contractId: documentId,
  cycle: z.number().int().min(0),
  reviewerUid: documentId,
  decision: z.enum(['APPROVE', 'REQUEST_CHANGES']),
  note: taskTermsSchema.shape.description,
  createdAt: utcIsoDateTimeSchema,
});
export const pendingRewardSchema = z.strictObject({
  id: documentId,
  familyId: documentId,
  contractId: documentId,
  parentUid: documentId,
  childUid: documentId,
  terms: rewardTermsSchema,
  status: z.literal('PENDING_FULFILLMENT'),
  earnedAt: utcIsoDateTimeSchema,
});
export const rewardStatusSchema = z.enum([
  'PENDING_FULFILLMENT',
  'AWAITING_CHILD_CONFIRMATION',
  'FULFILLED',
  'CANCELLED',
]);
export const deliveredRewardSchema = pendingRewardSchema
  .extend({
    status: z.literal('AWAITING_CHILD_CONFIRMATION'),
    deliveredAt: utcIsoDateTimeSchema,
    deliveredBy: documentId,
  })
  .superRefine((reward, ctx) => {
    if (
      reward.deliveredBy !== reward.parentUid ||
      Date.parse(reward.deliveredAt) < Date.parse(reward.earnedAt)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['deliveredBy'],
        message: 'Delivery requires the Parent after earning.',
      });
  });
export const fulfilledRewardSchema = pendingRewardSchema
  .extend({
    status: z.literal('FULFILLED'),
    deliveredAt: utcIsoDateTimeSchema,
    deliveredBy: documentId,
    confirmedAt: utcIsoDateTimeSchema,
    confirmedBy: documentId,
    fulfilledAt: utcIsoDateTimeSchema,
  })
  .superRefine((reward, ctx) => {
    if (
      reward.deliveredBy !== reward.parentUid ||
      reward.confirmedBy !== reward.childUid ||
      Date.parse(reward.deliveredAt) < Date.parse(reward.earnedAt) ||
      Date.parse(reward.confirmedAt) < Date.parse(reward.deliveredAt) ||
      reward.fulfilledAt !== reward.confirmedAt
    )
      ctx.addIssue({
        code: 'custom',
        path: ['confirmedBy'],
        message:
          'Fulfillment requires Child confirmation after Parent delivery.',
      });
  });
export const rewardSchema = z.discriminatedUnion('status', [
  pendingRewardSchema,
  deliveredRewardSchema,
  fulfilledRewardSchema,
]);
export const markRewardDeliveredInputSchema = z.strictObject({
  rewardId: documentId,
  idempotencyKey: idempotencyKeySchema,
});
export const markRewardDeliveredOutputSchema = z.strictObject({
  reward: deliveredRewardSchema,
});
export const confirmRewardReceivedInputSchema = markRewardDeliveredInputSchema;
export const confirmRewardReceivedOutputSchema = z.strictObject({
  reward: fulfilledRewardSchema,
});
export type ConfirmRewardReceivedInputValue = z.input<
  typeof confirmRewardReceivedInputSchema
>;
export type ConfirmRewardReceivedOutput = z.output<
  typeof confirmRewardReceivedOutputSchema
>;
export const rewardCommandErrorCodes = {
  authRequired: 'AUTH_REQUIRED',
  invalidInput: 'INVALID_INPUT',
  forbidden: 'FORBIDDEN',
  familyMembershipRequired: 'FAMILY_MEMBERSHIP_REQUIRED',
  wrongActorRole: 'WRONG_ACTOR_ROLE',
  invalidState: 'INVALID_STATE',
  rewardNotFound: 'REWARD_NOT_FOUND',
  rewardAlreadyFulfilled: 'REWARD_ALREADY_FULFILLED',
  rewardAlreadyDelivered: 'REWARD_ALREADY_DELIVERED',
  idempotencyConflict: 'IDEMPOTENCY_CONFLICT',
} as const;
export type RewardCommandErrorCode =
  (typeof rewardCommandErrorCodes)[keyof typeof rewardCommandErrorCodes];
export type MarkRewardDeliveredInputValue = z.input<
  typeof markRewardDeliveredInputSchema
>;
export type MarkRewardDeliveredOutput = z.output<
  typeof markRewardDeliveredOutputSchema
>;
export const approveContractInputSchema = z.strictObject({
  contractId: documentId,
  idempotencyKey: idempotencyKeySchema,
});
export const approveContractOutputSchema = z
  .strictObject({
    contract: contractSchema.extend({
      status: z.literal('APPROVED'),
      approvedAt: utcIsoDateTimeSchema,
    }),
    review: contractReviewSchema.extend({ decision: z.literal('APPROVE') }),
    reward: pendingRewardSchema,
  })
  .superRefine(({ contract, review, reward }, ctx) => {
    if (
      review.contractId !== contract.id ||
      reward.contractId !== contract.id ||
      review.familyId !== contract.familyId ||
      reward.familyId !== contract.familyId ||
      review.reviewerUid !== contract.parentUid ||
      reward.parentUid !== contract.parentUid ||
      reward.childUid !== contract.childUid ||
      review.cycle !== contract.reviewCycle ||
      review.createdAt !== contract.approvedAt ||
      reward.earnedAt !== contract.approvedAt ||
      contract.updatedAt !== contract.approvedAt ||
      JSON.stringify(reward.terms) !== JSON.stringify(contract.rewardTerms)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['contract'],
        message:
          'Approval records must identify the same committed Contract and round.',
      });
  });
export type ContractReview = z.output<typeof contractReviewSchema>;
export type EarnedReward = z.output<typeof rewardSchema>;
export type ApproveContractInput = z.output<typeof approveContractInputSchema>;
export type ApproveContractInputValue = z.input<
  typeof approveContractInputSchema
>;
export type ApproveContractOutput = z.output<
  typeof approveContractOutputSchema
>;

export const reviewFeedbackSchema = taskTermsSchema.shape.description.unwrap();
export const requestContractChangesInputSchema = z.strictObject({
  contractId: documentId,
  idempotencyKey: idempotencyKeySchema,
  note: reviewFeedbackSchema,
});
export const requestContractChangesOutputSchema = z
  .strictObject({
    contract: contractSchema.extend({ status: z.literal('CHANGES_REQUESTED') }),
    review: contractReviewSchema.extend({
      decision: z.literal('REQUEST_CHANGES'),
      note: reviewFeedbackSchema,
    }),
  })
  .superRefine(({ contract, review }, ctx) => {
    if (
      review.contractId !== contract.id ||
      review.familyId !== contract.familyId ||
      review.reviewerUid !== contract.parentUid ||
      review.cycle !== contract.reviewCycle ||
      review.createdAt !== contract.updatedAt
    )
      ctx.addIssue({
        code: 'custom',
        path: ['review'],
        message: 'Review must identify the committed Contract and round.',
      });
  });
export type RequestContractChangesInput = z.output<
  typeof requestContractChangesInputSchema
>;
export type RequestContractChangesInputValue = z.input<
  typeof requestContractChangesInputSchema
>;
export type RequestContractChangesOutput = z.output<
  typeof requestContractChangesOutputSchema
>;
