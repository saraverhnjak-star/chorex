import {
  acceptOfferInputSchema,
  acceptOfferOutputSchema,
  contractSchema,
  contractTaskSchema,
  rejectOfferInputSchema,
  rejectOfferOutputSchema,
} from '@chorex/domain';

const timestamp = '2026-10-04T10:00:00.000Z';

it('validates the canonical active Contract and its initial task', () => {
  expect(
    contractSchema.parse({
      id: 'contract-1',
      familyId: 'family-1',
      parentUid: 'parent-1',
      childUid: 'child-1',
      source: {
        type: 'OFFER',
        offerId: 'offer-1',
        revisionId: 'revision-1',
      },
      rewardTerms: { title: 'Cinema', type: 'EXPERIENCE' },
      deadlineAt: '2026-10-05T10:00:00.000Z',
      status: 'ACTIVE',
      reviewCycle: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).status,
  ).toBe('ACTIVE');
  expect(
    contractTaskSchema.parse({
      id: 'task-1',
      familyId: 'family-1',
      contractId: 'contract-1',
      assigneeUid: 'child-1',
      title: 'Load the dishwasher',
      targetCount: 2,
      completedCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).completedCount,
  ).toBe(0);
});

it('rejects authoritative or malformed acceptOffer input', () => {
  expect(
    acceptOfferInputSchema.safeParse({
      offerId: 'offer-1',
      currentRevisionId: 'revision-1',
      idempotencyKey: 'accept-offer-001',
      childUid: 'untrusted-child',
    }).success,
  ).toBe(false);
  expect(
    contractTaskSchema.safeParse({
      id: 'task-1',
      familyId: 'family-1',
      contractId: 'contract-1',
      assigneeUid: 'child-1',
      title: 'Load the dishwasher',
      targetCount: 1,
      completedCount: 2,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).success,
  ).toBe(false);
});

it('validates strict rejectOffer input and rejected output', () => {
  expect(
    rejectOfferInputSchema.safeParse({
      offerId: 'offer-1',
      currentRevisionId: 'revision-1',
      idempotencyKey: 'reject-offer-001',
      role: 'CHILD',
    }).success,
  ).toBe(false);
  expect(
    rejectOfferOutputSchema.parse({
      offer: {
        id: 'offer-1',
        familyId: 'family-1',
        parentUid: 'parent-1',
        childUid: 'child-1',
        status: 'REJECTED',
        currentRevisionId: 'revision-1',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    }).offer.status,
  ).toBe('REJECTED');
});

it('requires output tasks to belong to the accepted Contract', () => {
  const result = acceptOfferOutputSchema.safeParse({
    offer: {
      id: 'offer-1',
      familyId: 'family-1',
      parentUid: 'parent-1',
      childUid: 'child-1',
      status: 'ACCEPTED',
      currentRevisionId: 'revision-1',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    contract: {
      id: 'contract-1',
      familyId: 'family-1',
      parentUid: 'parent-1',
      childUid: 'child-1',
      source: {
        type: 'OFFER',
        offerId: 'offer-1',
        revisionId: 'revision-1',
      },
      rewardTerms: { title: 'Cinema', type: 'EXPERIENCE' },
      deadlineAt: '2026-10-05T10:00:00.000Z',
      status: 'ACTIVE',
      reviewCycle: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    tasks: [
      {
        id: 'task-1',
        familyId: 'family-1',
        contractId: 'different-contract',
        assigneeUid: 'child-1',
        title: 'Load the dishwasher',
        targetCount: 1,
        completedCount: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  });
  expect(result.success).toBe(false);
});
