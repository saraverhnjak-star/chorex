import { z } from 'zod';

const requiredNameSchema = z.string().trim().min(1, 'This field is required.');

export const utcIsoDateTimeSchema = z.string().refine((value) => {
  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && date.toISOString() === value;
}, 'Expected a normalized UTC ISO-8601 timestamp.');

export const userRoleSchema = z.enum(['PARENT', 'CHILD']);

export const createFamilyInputSchema = z.strictObject({
  displayName: requiredNameSchema,
  familyName: requiredNameSchema,
});

export const userProfileSchema = z.strictObject({
  uid: z.string().min(1),
  displayName: requiredNameSchema,
  accountType: userRoleSchema,
  createdAt: utcIsoDateTimeSchema,
});

export const persistedParentProfileSchema = userProfileSchema.extend({
  accountType: z.literal('PARENT'),
});

export const familySchema = z.strictObject({
  id: z.string().min(1),
  name: requiredNameSchema,
  createdBy: z.string().min(1),
  createdAt: utcIsoDateTimeSchema,
  updatedAt: utcIsoDateTimeSchema,
});

export const parentFamilyMembershipSchema = z.strictObject({
  uid: z.string().min(1),
  familyId: z.string().min(1),
  role: z.literal('PARENT'),
  displayName: requiredNameSchema,
  status: z.literal('ACTIVE'),
  joinedAt: utcIsoDateTimeSchema,
});

export const createFamilyOutputSchema = z.strictObject({
  profile: persistedParentProfileSchema,
  family: familySchema,
  membership: parentFamilyMembershipSchema,
});

export const familyCommandErrorCodes = {
  authRequired: 'AUTH_REQUIRED',
  invalidInput: 'INVALID_INPUT',
  wrongActorRole: 'WRONG_ACTOR_ROLE',
  idempotencyConflict: 'IDEMPOTENCY_CONFLICT',
} as const;

export type CreateFamilyInput = z.output<typeof createFamilyInputSchema>;
export type CreateFamilyInputValue = z.input<typeof createFamilyInputSchema>;
export type CreateFamilyOutput = z.output<typeof createFamilyOutputSchema>;
export type UserProfile = z.output<typeof userProfileSchema>;
export type PersistedParentProfile = z.output<
  typeof persistedParentProfileSchema
>;
export type FamilyCommandErrorCode =
  (typeof familyCommandErrorCodes)[keyof typeof familyCommandErrorCodes];
