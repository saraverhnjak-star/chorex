import { childOfferInboxItemSchema } from '@chorex/domain';

const validItem = {
  offer: {
    id: 'offer-1',
    familyId: 'family-1',
    parentUid: 'parent-1',
    childUid: 'child-1',
    status: 'AWAITING_CHILD',
    currentRevisionId: 'revision-2',
    createdAt: '2026-10-03T12:34:56.789Z',
    updatedAt: '2026-10-03T12:35:56.789Z',
  },
  revision: {
    id: 'revision-2',
    offerId: 'offer-1',
    revisionNumber: 2,
    proposedByUid: 'parent-1',
    proposedByRole: 'PARENT',
    tasks: [{ title: 'Load the dishwasher', targetCount: 2 }],
    reward: { title: 'Cinema', type: 'EXPERIENCE', iconKey: 'cinema' as const },
    deadlineAt: '2026-10-10T18:00:00.000Z',
    createdAt: '2026-10-03T12:34:56.789Z',
  },
} as const;

it('accepts only the exact current Offer revision', () => {
  expect(childOfferInboxItemSchema.safeParse(validItem).success).toBe(true);
  expect(
    childOfferInboxItemSchema.safeParse({
      ...validItem,
      revision: { ...validItem.revision, id: 'revision-1' },
    }).success,
  ).toBe(false);
});

it('rejects malformed persisted Offer data', () => {
  expect(
    childOfferInboxItemSchema.safeParse({
      ...validItem,
      revision: {
        ...validItem.revision,
        tasks: [{ title: 'Load the dishwasher', targetCount: 0 }],
      },
    }).success,
  ).toBe(false);
});
