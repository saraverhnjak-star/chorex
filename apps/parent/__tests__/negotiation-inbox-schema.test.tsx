import { parentNegotiationInboxItemSchema } from '@chorex/domain';

const validItem = {
  offer: {
    id: 'offer-1',
    familyId: 'family-1',
    parentUid: 'parent-1',
    childUid: 'child-1',
    status: 'AWAITING_PARENT',
    currentRevisionId: 'revision-2',
    createdAt: '2026-10-03T12:34:56.789Z',
    updatedAt: '2026-10-03T12:35:56.789Z',
  },
  revision: {
    id: 'revision-2',
    offerId: 'offer-1',
    revisionNumber: 2,
    proposedByUid: 'child-1',
    proposedByRole: 'CHILD',
    tasks: [{ title: 'Load the dishwasher', targetCount: 2 }],
    reward: {
      title: 'One hour of games',
      type: 'PRIVILEGE',
      iconKey: 'screen-time' as const,
    },
    deadlineAt: '2026-10-10T18:00:00.000Z',
    note: 'This feels fair.',
    createdAt: '2026-10-03T12:35:56.789Z',
  },
} as const;

it('accepts only the exact current Child counteroffer revision', () => {
  expect(parentNegotiationInboxItemSchema.safeParse(validItem).success).toBe(
    true,
  );
  expect(
    parentNegotiationInboxItemSchema.safeParse({
      ...validItem,
      offer: { ...validItem.offer, currentRevisionId: 'revision-3' },
    }).success,
  ).toBe(false);
  expect(
    parentNegotiationInboxItemSchema.safeParse({
      ...validItem,
      revision: { ...validItem.revision, proposedByRole: 'PARENT' },
    }).success,
  ).toBe(false);
});

it('rejects malformed or incomplete current revisions', () => {
  expect(
    parentNegotiationInboxItemSchema.safeParse({
      ...validItem,
      revision: { ...validItem.revision, reward: undefined },
    }).success,
  ).toBe(false);
  expect(
    parentNegotiationInboxItemSchema.safeParse({
      ...validItem,
      revision: {
        ...validItem.revision,
        tasks: [{ title: 'Load the dishwasher', targetCount: 0 }],
      },
    }).success,
  ).toBe(false);
});
