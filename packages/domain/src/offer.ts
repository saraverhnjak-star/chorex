import { z } from 'zod';
import {
  idempotencyKeySchema,
  userRoleSchema,
  utcIsoDateTimeSchema,
} from './family';

export const offerValidationBounds = {
  idMaxLength: 128,
  taskCountMax: 10,
  titleMaxLength: 120,
  descriptionMaxLength: 500,
  targetCountMax: 100,
} as const;

const boundedIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(offerValidationBounds.idMaxLength);
const titleSchema = z
  .string()
  .trim()
  .min(1)
  .max(offerValidationBounds.titleMaxLength);
const optionalDescriptionSchema = z
  .string()
  .trim()
  .min(1)
  .max(offerValidationBounds.descriptionMaxLength)
  .optional();

export const taskTermsSchema = z.strictObject({
  title: titleSchema,
  description: optionalDescriptionSchema,
  targetCount: z
    .number()
    .int()
    .min(1)
    .max(offerValidationBounds.targetCountMax),
});

export const rewardTypeSchema = z.enum([
  'EXPERIENCE',
  'ITEM',
  'MONEY',
  'PRIVILEGE',
  'CUSTOM',
]);

export const rewardTermsSchema = z.strictObject({
  title: titleSchema,
  description: optionalDescriptionSchema,
  type: rewardTypeSchema,
});

export const offerStatusSchema = z.enum([
  'DRAFT',
  'AWAITING_CHILD',
  'AWAITING_PARENT',
  'ACCEPTED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
]);

export const offerSchema = z.strictObject({
  id: boundedIdSchema,
  familyId: boundedIdSchema,
  parentUid: boundedIdSchema,
  childUid: boundedIdSchema,
  status: offerStatusSchema,
  currentRevisionId: boundedIdSchema.optional(),
  expiresAt: utcIsoDateTimeSchema.optional(),
  createdAt: utcIsoDateTimeSchema,
  updatedAt: utcIsoDateTimeSchema,
});

export const offerRevisionSchema = z.strictObject({
  id: boundedIdSchema,
  offerId: boundedIdSchema,
  revisionNumber: z.number().int().min(1),
  proposedByUid: boundedIdSchema,
  proposedByRole: userRoleSchema,
  tasks: z
    .array(taskTermsSchema)
    .min(1)
    .max(offerValidationBounds.taskCountMax),
  reward: rewardTermsSchema,
  deadlineAt: utcIsoDateTimeSchema,
  note: optionalDescriptionSchema,
  createdAt: utcIsoDateTimeSchema,
});

const futureUtcIsoDateTimeSchema = utcIsoDateTimeSchema.refine(
  (value) => Date.parse(value) > Date.now(),
  'Deadline must be in the future.',
);

export const createOfferDraftInputSchema = z.strictObject({
  familyId: boundedIdSchema,
  childUid: boundedIdSchema,
  tasks: z
    .array(taskTermsSchema)
    .min(1)
    .max(offerValidationBounds.taskCountMax),
  reward: rewardTermsSchema,
  deadlineAt: futureUtcIsoDateTimeSchema,
  idempotencyKey: idempotencyKeySchema,
});

const createdOfferDraftSchema = offerSchema.extend({
  status: z.literal('DRAFT'),
  currentRevisionId: boundedIdSchema,
});

const initialOfferRevisionSchema = offerRevisionSchema.extend({
  revisionNumber: z.literal(1),
  proposedByRole: z.literal('PARENT'),
});

export const createOfferDraftOutputSchema = z.strictObject({
  offer: createdOfferDraftSchema,
  revision: initialOfferRevisionSchema,
});

export const publishOfferInputSchema = z.strictObject({
  offerId: boundedIdSchema,
  currentRevisionId: boundedIdSchema,
  idempotencyKey: idempotencyKeySchema,
});

const publishedOfferSchema = offerSchema.extend({
  status: z.literal('AWAITING_CHILD'),
  currentRevisionId: boundedIdSchema,
});

export const childOfferInboxItemSchema = z
  .strictObject({
    offer: publishedOfferSchema,
    revision: offerRevisionSchema,
  })
  .superRefine(({ offer, revision }, context) => {
    if (
      revision.id !== offer.currentRevisionId ||
      revision.offerId !== offer.id
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Revision must be the Offer current revision.',
        path: ['revision', 'id'],
      });
    }
  });

export const publishOfferOutputSchema = z.strictObject({
  offer: publishedOfferSchema,
});

export const rejectOfferInputSchema = z.strictObject({
  offerId: boundedIdSchema,
  currentRevisionId: boundedIdSchema,
  idempotencyKey: idempotencyKeySchema,
});

const rejectedOfferSchema = offerSchema.extend({
  status: z.literal('REJECTED'),
  currentRevisionId: boundedIdSchema,
});

export const rejectOfferOutputSchema = z.strictObject({
  offer: rejectedOfferSchema,
});

export const offerCommandErrorCodes = {
  authRequired: 'AUTH_REQUIRED',
  invalidInput: 'INVALID_INPUT',
  forbidden: 'FORBIDDEN',
  familyMembershipRequired: 'FAMILY_MEMBERSHIP_REQUIRED',
  wrongActorRole: 'WRONG_ACTOR_ROLE',
  childMembershipRequired: 'CHILD_MEMBERSHIP_REQUIRED',
  invalidState: 'INVALID_STATE',
  staleRevision: 'STALE_REVISION',
  deadlinePassed: 'DEADLINE_PASSED',
  idempotencyConflict: 'IDEMPOTENCY_CONFLICT',
} as const;

export type TaskTerms = z.output<typeof taskTermsSchema>;
export type RewardType = z.output<typeof rewardTypeSchema>;
export type RewardTerms = z.output<typeof rewardTermsSchema>;
export type Offer = z.output<typeof offerSchema>;
export type OfferRevision = z.output<typeof offerRevisionSchema>;
export type CreateOfferDraftInput = z.output<
  typeof createOfferDraftInputSchema
>;
export type CreateOfferDraftInputValue = z.input<
  typeof createOfferDraftInputSchema
>;
export type CreateOfferDraftOutput = z.output<
  typeof createOfferDraftOutputSchema
>;
export type PublishOfferInput = z.output<typeof publishOfferInputSchema>;
export type PublishOfferInputValue = z.input<typeof publishOfferInputSchema>;
export type PublishOfferOutput = z.output<typeof publishOfferOutputSchema>;
export type RejectOfferInput = z.output<typeof rejectOfferInputSchema>;
export type RejectOfferInputValue = z.input<typeof rejectOfferInputSchema>;
export type RejectOfferOutput = z.output<typeof rejectOfferOutputSchema>;
export type ChildOfferInboxItem = z.output<typeof childOfferInboxItemSchema>;
export type OfferCommandErrorCode =
  (typeof offerCommandErrorCodes)[keyof typeof offerCommandErrorCodes];
