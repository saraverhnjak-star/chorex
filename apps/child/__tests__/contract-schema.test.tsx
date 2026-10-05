import {
  acceptOfferInputSchema,
  acceptOfferOutputSchema,
  contractSchema,
  contractTaskSchema,
  counterOfferInputSchema,
  counterOfferOutputSchema,
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

it('validates reward-only counterOffer input and its current Child revision', () => {
  const input = {
    offerId: 'offer-1',
    currentRevisionId: 'revision-1',
    reward: {
      title: 'Extra screen time',
      type: 'PRIVILEGE' as const,
    },
    note: 'Could we make it an hour?',
    idempotencyKey: 'counter-offer-001',
  };
  expect(counterOfferInputSchema.safeParse(input).success).toBe(true);
  expect(
    counterOfferInputSchema.safeParse({
      ...input,
      tasks: [{ title: 'Different task', targetCount: 1 }],
    }).success,
  ).toBe(false);
  expect(
    counterOfferInputSchema.safeParse({
      ...input,
      deadlineAt: '2026-10-06T10:00:00.000Z',
    }).success,
  ).toBe(false);

  const output = {
    offer: {
      id: 'offer-1',
      familyId: 'family-1',
      parentUid: 'parent-1',
      childUid: 'child-1',
      status: 'AWAITING_PARENT' as const,
      currentRevisionId: 'revision-2',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    revision: {
      id: 'revision-2',
      offerId: 'offer-1',
      revisionNumber: 2,
      proposedByUid: 'child-1',
      proposedByRole: 'CHILD' as const,
      tasks: [{ title: 'Load the dishwasher', targetCount: 2 }],
      reward: input.reward,
      deadlineAt: '2026-10-05T10:00:00.000Z',
      note: input.note,
      createdAt: timestamp,
    },
  };
  expect(counterOfferOutputSchema.parse(output).revision.revisionNumber).toBe(
    2,
  );
  expect(
    counterOfferOutputSchema.safeParse({
      ...output,
      offer: { ...output.offer, currentRevisionId: 'revision-3' },
    }).success,
  ).toBe(false);
});

it('validates complete Parent counteroffer terms and the matching waiting state', () => {
  const input = {
    offerId: 'offer-1',
    currentRevisionId: 'revision-2',
    tasks: [{ title: 'Water plants', description: 'All pots', targetCount: 3 }],
    reward: { title: 'Museum', type: 'EXPERIENCE' },
    deadlineAt: '2026-10-10T18:00:00.000Z',
    idempotencyKey: 'parent-counter-001',
  };
  expect(counterOfferInputSchema.safeParse(input).success).toBe(true);
  expect(
    counterOfferInputSchema.safeParse({ ...input, tasks: [] }).success,
  ).toBe(false);
  expect(
    counterOfferInputSchema.safeParse({ ...input, proposedByRole: 'PARENT' })
      .success,
  ).toBe(false);
  const output = {
    offer: {
      id: input.offerId,
      familyId: 'family-1',
      parentUid: 'parent-1',
      childUid: 'child-1',
      status: 'AWAITING_CHILD',
      currentRevisionId: 'revision-3',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    revision: {
      id: 'revision-3',
      offerId: input.offerId,
      revisionNumber: 3,
      proposedByUid: 'parent-1',
      proposedByRole: 'PARENT',
      tasks: input.tasks,
      reward: input.reward,
      deadlineAt: input.deadlineAt,
      createdAt: timestamp,
    },
  };
  expect(counterOfferOutputSchema.safeParse(output).success).toBe(true);
  expect(
    counterOfferOutputSchema.safeParse({
      ...output,
      offer: { ...output.offer, status: 'AWAITING_PARENT' },
    }).success,
  ).toBe(false);
  expect(
    counterOfferOutputSchema.safeParse({
      ...output,
      revision: { ...output.revision, proposedByUid: 'child-1' },
    }).success,
  ).toBe(false);
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
