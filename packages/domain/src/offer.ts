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

export const offerCommandErrorCodes = {
  authRequired: 'AUTH_REQUIRED',
  invalidInput: 'INVALID_INPUT',
  familyMembershipRequired: 'FAMILY_MEMBERSHIP_REQUIRED',
  wrongActorRole: 'WRONG_ACTOR_ROLE',
  childMembershipRequired: 'CHILD_MEMBERSHIP_REQUIRED',
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
export type OfferCommandErrorCode =
  (typeof offerCommandErrorCodes)[keyof typeof offerCommandErrorCodes];
