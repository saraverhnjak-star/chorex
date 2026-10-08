import {
  deserializeContractReviews,
  deserializeContract,
  deserializeTasks,
} from '../../../packages/firebase-client/src/contractReadModel';
const contract = {
  id: 'contract-1',
  familyId: 'family-1',
  parentUid: 'parent-1',
  childUid: 'child-1',
  source: { type: 'OFFER', offerId: 'offer-1', revisionId: 'revision-2' },
  rewardTerms: {
    title: 'Cinema',
    type: 'EXPERIENCE',
    iconKey: 'cinema' as const,
    description: 'Choose a movie',
  },
  deadlineAt: '2026-10-10T18:00:00.000Z',
  status: 'ACTIVE',
  reviewCycle: 0,
  createdAt: '2026-10-05T12:00:00.000Z',
  updatedAt: '2026-10-05T12:00:00.000Z',
} as const;
const task = {
  id: 'task-1',
  familyId: 'family-1',
  contractId: 'contract-1',
  assigneeUid: 'child-1',
  title: 'Dishwasher',
  description: 'After dinner',
  completedCount: 0,
  targetCount: 3,
  createdAt: contract.createdAt,
  updatedAt: contract.updatedAt,
} as const;

const timestamp = (iso: string) => ({ toDate: () => new Date(iso) });
function persistedContract() {
  const { id: _id, ...data } = contract;
  return {
    ...data,
    participantUids: ['parent-1', 'child-1'],
    createdAt: timestamp(data.createdAt),
    updatedAt: timestamp(data.updatedAt),
    deadlineAt: timestamp(data.deadlineAt),
  };
}
function persistedTask() {
  const { id: _id, ...data } = task;
  return {
    ...data,
    createdAt: timestamp(data.createdAt),
    updatedAt: timestamp(data.updatedAt),
  };
}
it('deserializes the complete accepted snapshot without any Offer or Reward lookup', () => {
  const data = persistedContract();
  const before = JSON.stringify(data);
  expect(deserializeContract(contract.id, data)).toEqual(contract);
  expect(JSON.stringify(data)).toBe(before);
  const result = deserializeContract(contract.id, data);
  expect(result.source).toEqual({
    type: 'OFFER',
    offerId: 'offer-1',
    revisionId: 'revision-2',
  });
  expect(result.reviewCycle).toBe(0);
  expect(result.status).toBe('ACTIVE');
  expect(result.rewardTerms).toEqual(contract.rewardTerms);
  expect(result.deadlineAt).toBe(contract.deadlineAt);
});
it('scopes tasks and orders by deterministic persisted document IDs without changing inputs', () => {
  const rows = [
    { id: 'task-z', data: persistedTask() },
    { id: 'task-a', data: persistedTask() },
  ];
  expect(deserializeTasks('contract-1', rows).map((row) => row.id)).toEqual([
    'task-a',
    'task-z',
  ]);
  expect(rows[0].id).toBe('task-z');
  expect(() => deserializeTasks('contract-2', rows)).toThrow('MALFORMED_DATA');
});
it('rejects malformed status, timestamps, participant projection and progress', () => {
  expect(() =>
    deserializeContract(contract.id, {
      ...persistedContract(),
      status: 'COMPLETED',
    }),
  ).toThrow('MALFORMED_DATA');
  expect(() =>
    deserializeContract(contract.id, {
      ...persistedContract(),
      deadlineAt: contract.deadlineAt,
    }),
  ).toThrow('MALFORMED_DATA');
  expect(() =>
    deserializeContract(contract.id, {
      ...persistedContract(),
      participantUids: ['outsider', 'child-1'],
    }),
  ).toThrow('MALFORMED_DATA');
  expect(() =>
    deserializeTasks('contract-1', [
      { id: task.id, data: { ...persistedTask(), completedCount: 4 } },
    ]),
  ).toThrow('MALFORMED_DATA');
});

const reviewRows = [0, 1, 2].map((cycle) => ({
  id: `review-${cycle}`,
  data: {
    familyId: contract.familyId,
    contractId: contract.id,
    cycle,
    reviewerUid: contract.parentUid,
    decision: cycle === 2 ? 'APPROVE' : 'REQUEST_CHANGES',
    ...(cycle === 2 ? {} : { note: `Feedback ${cycle}` }),
    createdAt: timestamp(contract.createdAt),
  },
}));
it('reads complete immutable history in cycle order without inferring rounds or approval notes', () => {
  const before = JSON.stringify(reviewRows);
  expect(deserializeContractReviews([], contract)).toEqual([]);
  const history = deserializeContractReviews(
    [...reviewRows].reverse(),
    contract,
  );
  expect(history.map((r) => r.cycle)).toEqual([0, 1, 2]);
  expect(history.map((r) => r.note)).toEqual([
    'Feedback 0',
    'Feedback 1',
    undefined,
  ]);
  expect(history[2].createdAt).toBe(contract.createdAt);
  expect(JSON.stringify(reviewRows)).toBe(before);
  for (const row of reviewRows)
    expect(deserializeContractReviews([row], contract)).toHaveLength(1);
});
it('rejects duplicate rounds, wrong scope/author, invalid decision/time and absent request feedback', () => {
  expect(() =>
    deserializeContractReviews(
      [reviewRows[0], { ...reviewRows[0], id: 'duplicate' }],
      contract,
    ),
  ).toThrow('MALFORMED_DATA');
  for (const patch of [
    { familyId: 'other' },
    { contractId: 'other' },
    { reviewerUid: 'other' },
    { cycle: -1 },
    { decision: 'PENDING' },
    { createdAt: 'invalid' },
    { note: undefined },
    { note: '' },
  ]) {
    expect(() =>
      deserializeContractReviews(
        [{ ...reviewRows[0], data: { ...reviewRows[0].data, ...patch } }],
        contract,
      ),
    ).toThrow('MALFORMED_DATA');
  }
});
