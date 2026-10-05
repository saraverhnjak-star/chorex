import { z } from 'zod';

const id = z.string().min(1).max(128);
export const negotiationNotificationDataSchema = z
  .strictObject({
    type: z.enum([
      'OFFER_PUBLISHED',
      'OFFER_COUNTERED',
      'OFFER_ACCEPTED',
      'CONTRACT_APPROVED',
      'CONTRACT_CHANGES_REQUESTED',
    ]),
    entityType: z.enum(['OFFER', 'CONTRACT']),
    entityId: id,
    familyId: id,
  })
  .superRefine((data, context) => {
    if (
      data.entityType !==
      ([
        'OFFER_ACCEPTED',
        'CONTRACT_APPROVED',
        'CONTRACT_CHANGES_REQUESTED',
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
