import { z } from 'zod';

const id = z
  .string()
  .min(1)
  .max(128)
  .refine(
    (value) =>
      value === value.trim() &&
      !/[\/\\?#\u0000-\u001f\u007f]/u.test(value) &&
      value !== '.' &&
      value !== '..',
    'Expected one document ID.',
  );
export const negotiationNotificationDataSchema = z
  .strictObject({
    type: z.enum([
      'OFFER_PUBLISHED',
      'OFFER_COUNTERED',
      'OFFER_ACCEPTED',
      'CONTRACT_APPROVED',
      'CONTRACT_CHANGES_REQUESTED',
      'CONTRACT_SUBMITTED',
      'REWARD_FULFILLED',
      'CONTRACT_DEADLINE_REMINDER',
      'PENDING_REWARD_REMINDER',
    ]),
    entityType: z.enum(['OFFER', 'CONTRACT', 'REWARD']),
    entityId: id,
    familyId: id,
  })
  .superRefine((data, context) => {
    if (
      data.entityType !==
      (['REWARD_FULFILLED', 'PENDING_REWARD_REMINDER'].includes(data.type)
        ? 'REWARD'
        : [
              'OFFER_ACCEPTED',
              'CONTRACT_APPROVED',
              'CONTRACT_CHANGES_REQUESTED',
              'CONTRACT_SUBMITTED',
              'CONTRACT_DEADLINE_REMINDER',
            ].includes(data.type)
          ? 'CONTRACT'
          : 'OFFER')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['entityType'],
        message: 'Invalid notification entity.',
      });
    }
  });
export type NegotiationNotificationData = z.output<
  typeof negotiationNotificationDataSchema
>;
