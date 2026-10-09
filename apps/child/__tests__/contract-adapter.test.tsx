import {
  upsertCurrentPushDevice,
  saveReminderPreference,
  subscribeReminderPreference,
  deleteCurrentPushDevice,
  markRewardDelivered,
  confirmRewardReceived,
  RewardClientError,
  observeReward,
  observePendingRewards,
  observeEarnedRewards,
  readCurrentParentFamily,
  requestContractChanges,
  observeContractReviews,
  observeCurrentContractReview,
  approveContract,
  observeReadyForReviewContracts,
  submitContractForReview,
  recordTaskCompletion,
  ContractClientError,
  observeContract,
  observeTasks,
  observeActiveContracts,
} from '@chorex/firebase-client';

const mockTransaction = { get: jest.fn(), set: jest.fn(), delete: jest.fn() };
const mockRunTransaction = jest.fn(async (_db, callback) =>
  callback(mockTransaction),
);
const mockServerTimestamp = jest.fn(() => 'server-time');
const mockCallable = jest.fn();
const mockHttpsCallable = jest.fn(
  (_service: unknown, _name: string) => mockCallable,
);
const mockStop = jest.fn();
const mockGetDoc = jest.fn();
const mockGetDocs = jest.fn();
let mockSnapshot: (value: unknown) => void;
let mockFailure: (error: unknown) => void;
const mockListen = jest.fn((_ref, _options, callback, failure) => {
  mockSnapshot = callback;
  mockFailure = failure;
  return mockStop;
});
jest.mock('@react-native-firebase/app-check', () => ({}));
jest.mock('@react-native-firebase/app', () => ({}));
jest.mock('@react-native-firebase/auth', () => ({}));
jest.mock('@react-native-firebase/functions', () => ({
  httpsCallable: (service: unknown, name: string) =>
    mockHttpsCallable(service, name),
}));
jest.mock('@react-native-firebase/firestore', () => ({
  runTransaction: (
    db: unknown,
    callback: (transaction: typeof mockTransaction) => Promise<void>,
  ) => mockRunTransaction(db, callback),
  serverTimestamp: () => mockServerTimestamp(),
  getDoc: (ref: unknown) => mockGetDoc(ref),
  getDocs: (ref: unknown) => mockGetDocs(ref),
  collection: (_db: unknown, ...path: string[]) => path.join('/'),
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  where: (...args: unknown[]) => ({ where: args }),
  orderBy: (...args: unknown[]) => ({ orderBy: args }),
  limit: (count: number) => ({ limit: count }),
  query: (path: string, ...constraints: unknown[]) => ({ path, constraints }),
  onSnapshot: (
    ref: unknown,
    options: unknown,
    callback: (value: unknown) => void,
    failure: (error: unknown) => void,
  ) => mockListen(ref, options, callback, failure),
}));
const iso = '2026-10-10T18:00:00.000Z';
const timestamp = { toDate: () => new Date(iso) };
const contractData = {
  familyId: 'family-1',
  parentUid: 'parent-1',
  childUid: 'child-1',
  participantUids: ['parent-1', 'child-1'],
  source: { type: 'OFFER', offerId: 'offer-1', revisionId: 'revision-1' },
  rewardTerms: {
    title: 'Cinema',
    type: 'EXPERIENCE',
    iconKey: 'cinema' as const,
  },
  deadlineAt: timestamp,
  status: 'ACTIVE',
  reviewCycle: 0,
  createdAt: timestamp,
  updatedAt: timestamp,
};
beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(globalThis, {
    __chorexDevelopmentFirebase: {
      services: {
        auth: { currentUser: { uid: 'child-1' } },
        firestore: {},
        functions: {},
      },
    },
  });
});
afterAll(() =>
  Reflect.deleteProperty(globalThis, '__chorexDevelopmentFirebase'),
);
it('loads the Parent family using an explicit active Child membership query', async () => {
  const dataByPath: Record<string, unknown> = {
    'users/child-1': {
      displayName: 'Parent',
      accountType: 'PARENT',
      familyIds: ['family-1'],
      createdAt: timestamp,
    },
    'families/family-1': {
      name: 'Family',
      createdBy: 'child-1',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    'families/family-1/members/child-1': {
      role: 'PARENT',
      displayName: 'Parent',
      status: 'ACTIVE',
      joinedAt: timestamp,
    },
  };
  mockGetDoc.mockImplementation((path: string) =>
    Promise.resolve({ exists: () => true, data: () => dataByPath[path] }),
  );
  mockGetDocs.mockResolvedValue({ docs: [] });

  await expect(readCurrentParentFamily()).resolves.toEqual(
    expect.objectContaining({
      family: expect.objectContaining({ id: 'family-1' }),
      children: [],
    }),
  );
  expect(mockGetDocs).toHaveBeenCalledWith({
    path: 'families/family-1/members',
    constraints: [
      { where: ['role', '==', 'CHILD'] },
      { where: ['status', '==', 'ACTIVE'] },
    ],
  });
});
it('uses one Contract document listener with cache metadata and canonical deserialization', () => {
  const callback = jest.fn();
  const failure = jest.fn();
  const stop = observeContract('contract-1', callback, failure);
  expect(mockListen.mock.calls[0].slice(0, 2)).toEqual([
    'contracts/contract-1',
    { includeMetadataChanges: true },
  ]);
  mockSnapshot({
    id: 'contract-1',
    exists: () => true,
    data: () => contractData,
    metadata: { fromCache: true },
  });
  expect(callback).toHaveBeenCalledWith({
    data: expect.objectContaining({
      id: 'contract-1',
      deadlineAt: iso,
      rewardTerms: contractData.rewardTerms,
      status: 'ACTIVE',
      reviewCycle: 0,
    }),
    fromCache: true,
  });
  mockSnapshot({
    id: 'contract-1',
    exists: () => false,
    metadata: { fromCache: false },
  });
  expect(callback).toHaveBeenLastCalledWith({ data: null, fromCache: false });
  mockFailure({ code: 'firestore/permission-denied' });
  expect(failure).toHaveBeenLastCalledWith(
    expect.objectContaining({ code: 'FORBIDDEN' }),
  );
  stop();
  expect(mockStop).toHaveBeenCalled();
});
it('listens only to the requested task subcollection and rejects another Contract task', () => {
  const callback = jest.fn();
  const failure = jest.fn();
  observeTasks('contract-1', callback, failure);
  expect(mockListen.mock.calls[0][0]).toBe('contracts/contract-1/tasks');
  const task = {
    familyId: 'family-1',
    contractId: 'contract-2',
    assigneeUid: 'child-1',
    title: 'Dishwasher',
    targetCount: 2,
    completedCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  mockSnapshot({
    docs: [{ id: 'task-1', data: () => task }],
    metadata: { fromCache: false },
  });
  expect(callback).not.toHaveBeenCalled();
  expect(failure).toHaveBeenCalledWith(
    expect.objectContaining({ code: 'MALFORMED_DATA' }),
  );
  mockFailure({ code: 'firestore/unavailable' });
  expect(failure).toHaveBeenLastCalledWith(
    expect.objectContaining({ code: 'NETWORK_UNAVAILABLE' }),
  );
});
it('constrains active list queries to the authenticated participant and family', () => {
  observeActiveContracts('family-1', jest.fn(), jest.fn());
  expect(mockListen.mock.calls[0][0]).toEqual({
    path: 'contracts',
    constraints: [
      { where: ['familyId', '==', 'family-1'] },
      { where: ['participantUids', 'array-contains', 'child-1'] },
      { where: ['status', '==', 'ACTIVE'] },
      { orderBy: ['createdAt', 'desc'] },
    ],
  });
});
it('rejects unauthenticated context and invalid IDs before registering a listener', () => {
  expect(() => observeContract('../bad', jest.fn(), jest.fn())).toThrow(
    'INVALID_INPUT',
  );
  Object.assign(globalThis, {
    __chorexDevelopmentFirebase: {
      services: { auth: { currentUser: null }, firestore: {} },
    },
  });
  expect(() => observeContract('contract-1', jest.fn(), jest.fn())).toThrow(
    'AUTH_REQUIRED',
  );
  expect(mockListen).not.toHaveBeenCalled();
});

it('calls the existing typed Functions boundary with only identity/key and validates the canonical result', async () => {
  const task = {
    id: 'task-1',
    familyId: 'family-1',
    contractId: 'contract-1',
    assigneeUid: 'child-1',
    title: 'Dishwasher',
    targetCount: 2,
    completedCount: 1,
    createdAt: iso,
    updatedAt: iso,
    lastCompletedAt: iso,
  };
  const result = {
    task,
    completion: {
      id: 'completion-1',
      familyId: 'family-1',
      contractId: 'contract-1',
      taskId: 'task-1',
      childUid: 'child-1',
      ordinal: 1,
      createdAt: iso,
    },
  };
  mockCallable.mockResolvedValueOnce({ data: result });
  const input = {
    contractId: 'contract-1',
    taskId: 'task-1',
    idempotencyKey: 'client-completion-001',
  };
  await expect(recordTaskCompletion(input)).resolves.toEqual(result);
  expect(mockHttpsCallable).toHaveBeenCalledWith(
    expect.anything(),
    'recordTaskCompletion',
  );
  expect(mockCallable).toHaveBeenCalledWith(input);
  await expect(
    recordTaskCompletion({ ...input, completedCount: 99 } as never),
  ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  mockCallable.mockRejectedValueOnce({
    details: { code: 'TASK_ALREADY_COMPLETE' },
    code: 'functions/failed-precondition',
  });
  await expect(recordTaskCompletion(input)).rejects.toEqual(
    new ContractClientError('TASK_ALREADY_COMPLETE'),
  );
  mockCallable.mockRejectedValueOnce({ code: 'functions/unavailable' });
  await expect(recordTaskCompletion(input)).rejects.toMatchObject({
    code: 'NETWORK_UNAVAILABLE',
  });
  mockCallable.mockResolvedValueOnce({
    data: { ...result, task: { ...task, contractId: 'another' } },
  });
  await expect(recordTaskCompletion(input)).rejects.toMatchObject({
    code: 'UNKNOWN_CONTRACT_FAILURE',
  });
});

it('submission callable validates identity, strict canonical status and stable task/connectivity errors', async () => {
  const input = {
    contractId: 'contract-1',
    idempotencyKey: 'submission-client-001',
  };
  const contract = {
    ...contractData,
    id: 'contract-1',
    status: 'READY_FOR_REVIEW',
    deadlineAt: iso,
    createdAt: iso,
    updatedAt: iso,
  };
  const { participantUids: _participants, ...canonical } = contract;
  mockCallable.mockResolvedValueOnce({ data: { contract: canonical } });
  await expect(submitContractForReview(input)).resolves.toEqual({
    contract: canonical,
  });
  expect(mockHttpsCallable).toHaveBeenLastCalledWith(
    expect.anything(),
    'submitContractForReview',
  );
  expect(mockCallable).toHaveBeenLastCalledWith(input);
  for (const code of [
    'TASKS_INCOMPLETE',
    'INVALID_STATE',
    'IDEMPOTENCY_CONFLICT',
  ]) {
    mockCallable.mockRejectedValueOnce({ details: { code } });
    await expect(submitContractForReview(input)).rejects.toMatchObject({
      code,
    });
  }
  mockCallable.mockRejectedValueOnce({ code: 'functions/unavailable' });
  await expect(submitContractForReview(input)).rejects.toMatchObject({
    code: 'NETWORK_UNAVAILABLE',
  });
  for (const patch of [{ status: 'ACTIVE' }, { id: 'another' }]) {
    mockCallable.mockResolvedValueOnce({
      data: { contract: { ...canonical, ...patch } },
    });
    await expect(submitContractForReview(input)).rejects.toMatchObject({
      code: 'UNKNOWN_CONTRACT_FAILURE',
    });
  }
  await expect(
    submitContractForReview({ ...input, allTasksComplete: true } as never),
  ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
});

it('approval adapter validates the linked canonical receipt and stable errors', async () => {
  const input = {
    contractId: 'contract-1',
    idempotencyKey: 'approval-client-001',
  };
  const { participantUids: _participants, ...canonical } = contractData;
  const result = {
    contract: {
      ...canonical,
      id: 'contract-1',
      deadlineAt: iso,
      createdAt: iso,
      updatedAt: iso,
      approvedAt: iso,
      status: 'APPROVED',
    },
    review: {
      id: 'review-1',
      familyId: 'family-1',
      contractId: 'contract-1',
      cycle: 0,
      reviewerUid: 'parent-1',
      decision: 'APPROVE',
      createdAt: iso,
    },
    reward: {
      id: 'reward-1',
      familyId: 'family-1',
      contractId: 'contract-1',
      parentUid: 'parent-1',
      childUid: 'child-1',
      terms: canonical.rewardTerms,
      status: 'PENDING_FULFILLMENT',
      earnedAt: iso,
    },
  };
  mockCallable.mockResolvedValueOnce({ data: result });
  await expect(approveContract(input)).resolves.toEqual(result);
  expect(mockHttpsCallable).toHaveBeenLastCalledWith(
    expect.anything(),
    'approveContract',
  );
  for (const patch of [
    { contract: { ...result.contract, id: 'another' } },
    { review: { ...result.review, cycle: 1 } },
  ]) {
    mockCallable.mockResolvedValueOnce({ data: { ...result, ...patch } });
    await expect(approveContract(input)).rejects.toMatchObject({
      code: 'UNKNOWN_CONTRACT_FAILURE',
    });
  }
  await expect(
    approveContract({ ...input, cycle: 0 } as never),
  ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  mockCallable.mockRejectedValueOnce({ details: { code: 'INVALID_STATE' } });
  await expect(approveContract(input)).rejects.toMatchObject({
    code: 'INVALID_STATE',
  });
  mockCallable.mockRejectedValueOnce({ code: 'functions/unavailable' });
  await expect(approveContract(input)).rejects.toMatchObject({
    code: 'NETWORK_UNAVAILABLE',
  });
});
it('review queue retains scoped queries, cache metadata and cleanup', () => {
  const callback = jest.fn();
  const stop = observeReadyForReviewContracts('family-1', callback, jest.fn());
  const ref = mockListen.mock.calls[0][0];
  expect(ref.constraints).toEqual(
    expect.arrayContaining([
      { where: ['familyId', '==', 'family-1'] },
      { where: ['participantUids', 'array-contains', 'child-1'] },
      { where: ['status', '==', 'READY_FOR_REVIEW'] },
    ]),
  );
  mockSnapshot({
    docs: [
      {
        id: 'contract-1',
        data: () => ({ ...contractData, status: 'READY_FOR_REVIEW' }),
      },
    ],
    metadata: { fromCache: true },
  });
  expect(callback).toHaveBeenCalledWith({
    data: [expect.objectContaining({ status: 'READY_FOR_REVIEW' })],
    fromCache: true,
  });
  stop();
  expect(mockStop).toHaveBeenCalled();
});

it('request changes adapter validates normalized feedback, linked receipt and stable conflict/error codes', async () => {
  const input = {
    contractId: 'contract-1',
    idempotencyKey: 'changes-client-001',
    note: ' Feedback ',
  };
  const { participantUids: _participants, ...canonical } = contractData;
  const result = {
    contract: {
      ...canonical,
      id: 'contract-1',
      deadlineAt: iso,
      createdAt: iso,
      updatedAt: iso,
      status: 'CHANGES_REQUESTED',
    },
    review: {
      id: 'review-1',
      familyId: 'family-1',
      contractId: 'contract-1',
      cycle: 0,
      reviewerUid: 'parent-1',
      decision: 'REQUEST_CHANGES',
      note: 'Feedback',
      createdAt: iso,
    },
  };
  mockCallable.mockResolvedValueOnce({ data: result });
  await expect(requestContractChanges(input)).resolves.toEqual(result);
  expect(mockCallable).toHaveBeenLastCalledWith({ ...input, note: 'Feedback' });
  expect(mockHttpsCallable).toHaveBeenLastCalledWith(
    expect.anything(),
    'requestContractChanges',
  );
  for (const note of ['', '  '])
    await expect(
      requestContractChanges({ ...input, note }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  mockCallable.mockRejectedValueOnce({
    details: { code: 'IDEMPOTENCY_CONFLICT' },
  });
  await expect(requestContractChanges(input)).rejects.toMatchObject({
    code: 'IDEMPOTENCY_CONFLICT',
  });
  mockCallable.mockRejectedValueOnce({ code: 'functions/unavailable' });
  await expect(requestContractChanges(input)).rejects.toMatchObject({
    code: 'NETWORK_UNAVAILABLE',
  });
  mockCallable.mockResolvedValueOnce({
    data: { ...result, review: { ...result.review, cycle: 1 } },
  });
  await expect(requestContractChanges(input)).rejects.toMatchObject({
    code: 'UNKNOWN_CONTRACT_FAILURE',
  });
});
it('current review query scopes family/Contract/round, bounds records and validates immutable feedback', () => {
  const { participantUids: _participants, ...data } = contractData;
  const contract = {
    ...data,
    id: 'contract-1',
    deadlineAt: iso,
    createdAt: iso,
    updatedAt: iso,
    status: 'CHANGES_REQUESTED',
  } as never;
  const callback = jest.fn(),
    error = jest.fn();
  const stop = observeCurrentContractReview(contract, callback, error);
  expect(mockListen.mock.calls[0][0]).toEqual({
    path: 'contracts/contract-1/reviews',
    constraints: [
      { where: ['familyId', '==', 'family-1'] },
      { where: ['contractId', '==', 'contract-1'] },
      { where: ['cycle', '==', 0] },
      { limit: 2 },
    ],
  });
  const review = {
    familyId: 'family-1',
    contractId: 'contract-1',
    cycle: 0,
    reviewerUid: 'parent-1',
    decision: 'REQUEST_CHANGES',
    note: 'Feedback',
    createdAt: timestamp,
  };
  const item = { id: 'review-1', data: () => review };
  mockSnapshot({ docs: [item], metadata: { fromCache: true } });
  expect(callback).toHaveBeenLastCalledWith({
    data: { ...review, id: 'review-1', createdAt: iso },
    fromCache: true,
  });
  mockSnapshot({ docs: [item, item], metadata: { fromCache: false } });
  expect(error).toHaveBeenLastCalledWith(
    expect.objectContaining({ code: 'MALFORMED_DATA' }),
  );
  for (const patch of [
    { familyId: 'wrong' },
    { cycle: 2 },
    { reviewerUid: 'other' },
    { note: '' },
    { decision: 'APPROVE' },
  ]) {
    mockSnapshot({
      docs: [{ ...item, data: () => ({ ...review, ...patch }) }],
      metadata: { fromCache: false },
    });
    expect(error).toHaveBeenLastCalledWith(
      expect.objectContaining({ code: 'MALFORMED_DATA' }),
    );
  }
  stop();
  expect(mockStop).toHaveBeenCalled();
});

const rewardData = {
  familyId: 'family-1',
  contractId: 'contract-1',
  parentUid: 'parent-1',
  childUid: 'child-1',
  terms: { title: 'Cinema', type: 'EXPERIENCE', iconKey: 'cinema' as const },
  status: 'PENDING_FULFILLMENT',
  earnedAt: timestamp,
};
it('Reward queries scope family and authenticated ownership, pending status and deterministic earned order', () => {
  observePendingRewards('family-1', jest.fn(), jest.fn());
  expect(mockListen.mock.calls[0][0]).toEqual({
    path: 'rewards',
    constraints: [
      { where: ['familyId', '==', 'family-1'] },
      { where: ['parentUid', '==', 'child-1'] },
      { where: ['status', '==', 'PENDING_FULFILLMENT'] },
      { orderBy: ['earnedAt', 'desc'] },
    ],
  });
  const receive = jest.fn(),
    failure = jest.fn();
  observeEarnedRewards('family-1', receive, failure);
  expect(mockListen.mock.calls[1][0]).toEqual({
    path: 'rewards',
    constraints: [
      { where: ['familyId', '==', 'family-1'] },
      { where: ['childUid', '==', 'child-1'] },
      { orderBy: ['earnedAt', 'desc'] },
    ],
  });
  mockSnapshot({
    docs: [{ id: 'reward-1', data: () => rewardData }],
    metadata: { fromCache: true },
  });
  expect(receive).toHaveBeenCalledWith({
    data: [
      expect.objectContaining({
        id: 'reward-1',
        earnedAt: iso,
        status: 'PENDING_FULFILLMENT',
      }),
    ],
    fromCache: true,
  });
  mockSnapshot({
    docs: [
      { id: 'reward-1', data: () => ({ ...rewardData, childUid: 'other' }) },
    ],
    metadata: { fromCache: false },
  });
  expect(failure).toHaveBeenCalledWith(
    expect.objectContaining({ code: 'MALFORMED_DATA' }),
  );
});
it('Reward detail listener parses fulfilled timestamps, denies unrelated ownership and translates provider errors', () => {
  const receive = jest.fn(),
    failure = jest.fn();
  const stop = observeReward('reward-1', receive, failure);
  expect(mockListen.mock.calls[0].slice(0, 2)).toEqual([
    'rewards/reward-1',
    { includeMetadataChanges: true },
  ]);
  mockSnapshot({
    id: 'reward-1',
    exists: () => true,
    data: () => ({
      ...rewardData,
      status: 'FULFILLED',
      fulfilledAt: timestamp,
      deliveredAt: timestamp,
      confirmedAt: timestamp,
      confirmedBy: 'child-1',
      deliveredBy: 'parent-1',
    }),
    metadata: { fromCache: false },
  });
  expect(receive).toHaveBeenCalledWith({
    data: expect.objectContaining({
      status: 'FULFILLED',
      fulfilledAt: iso,
      deliveredAt: iso,
      confirmedAt: iso,
      confirmedBy: 'child-1',
      deliveredBy: 'parent-1',
    }),
    fromCache: false,
  });
  mockSnapshot({
    id: 'reward-1',
    exists: () => true,
    data: () => ({
      ...rewardData,
      childUid: 'other',
      parentUid: 'other-parent',
    }),
    metadata: { fromCache: false },
  });
  expect(failure).toHaveBeenLastCalledWith(
    expect.objectContaining({ code: 'FORBIDDEN' }),
  );
  mockFailure({ code: 'firestore/permission-denied' });
  expect(failure).toHaveBeenLastCalledWith(
    expect.objectContaining({ code: 'FORBIDDEN' }),
  );
  stop();
  expect(mockStop).toHaveBeenCalled();
});
it('bilateral Reward adapters validates strict identity/receipt and maps stable/connectivity errors', async () => {
  const input = { rewardId: 'reward-1', idempotencyKey: 'fulfillment-key-001' };
  const output = {
    reward: {
      id: 'reward-1',
      ...rewardData,
      earnedAt: iso,
      status: 'AWAITING_CHILD_CONFIRMATION',
      deliveredAt: iso,
      deliveredBy: 'parent-1',
    },
  };
  mockCallable.mockResolvedValueOnce({ data: output });
  await expect(markRewardDelivered(input)).resolves.toEqual(output);
  expect(mockHttpsCallable).toHaveBeenCalledWith({}, 'markRewardDelivered');
  expect(mockCallable).toHaveBeenCalledWith(input);
  mockCallable.mockResolvedValueOnce({
    data: { reward: { ...output.reward, id: 'other' } },
  });
  await expect(markRewardDelivered(input)).rejects.toThrow(
    'UNKNOWN_REWARD_FAILURE',
  );
  mockCallable.mockRejectedValueOnce({
    details: { code: 'REWARD_ALREADY_DELIVERED' },
  });
  await expect(markRewardDelivered(input)).rejects.toThrow(
    'REWARD_ALREADY_DELIVERED',
  );
  mockCallable.mockRejectedValueOnce({ code: 'functions/unavailable' });
  await expect(markRewardDelivered(input)).rejects.toThrow(
    'NETWORK_UNAVAILABLE',
  );
  await expect(
    markRewardDelivered({ ...input, rewardId: '../bad' }),
  ).rejects.toBeInstanceOf(RewardClientError);
  const terminal = {
    reward: {
      ...output.reward,
      status: 'FULFILLED',
      confirmedAt: iso,
      confirmedBy: 'child-1',
      fulfilledAt: iso,
    },
  };
  mockCallable.mockResolvedValueOnce({ data: terminal });
  await expect(confirmRewardReceived(input)).resolves.toEqual(terminal);
  expect(mockHttpsCallable).toHaveBeenLastCalledWith(
    {},
    'confirmRewardReceived',
  );
  mockCallable.mockResolvedValueOnce({ data: output });
  await expect(confirmRewardReceived(input)).rejects.toThrow(
    'UNKNOWN_REWARD_FAILURE',
  );
});

it('history query reads every round in ascending order with metadata and existing access/error guards', () => {
  const { participantUids: _participants, ...data } = contractData;
  const contract = {
    ...data,
    id: 'contract-1',
    deadlineAt: iso,
    createdAt: iso,
    updatedAt: iso,
  } as never;
  const callback = jest.fn(),
    error = jest.fn();
  const stop = observeContractReviews(contract, callback, error);
  expect(mockListen.mock.calls[0][0]).toEqual({
    path: 'contracts/contract-1/reviews',
    constraints: [
      { where: ['familyId', '==', 'family-1'] },
      { where: ['contractId', '==', 'contract-1'] },
      { orderBy: ['cycle', 'asc'] },
    ],
  });
  expect(mockListen.mock.calls[0][1]).toEqual({ includeMetadataChanges: true });
  mockSnapshot({ docs: [], metadata: { fromCache: false } });
  expect(callback).toHaveBeenLastCalledWith({ data: [], fromCache: false });
  const rows = [0, 1, 2].map((cycle) => ({
    id: `review-${cycle}`,
    data: () => ({
      familyId: 'family-1',
      contractId: 'contract-1',
      reviewerUid: 'parent-1',
      cycle,
      decision: cycle === 2 ? 'APPROVE' : 'REQUEST_CHANGES',
      ...(cycle === 2 ? {} : { note: `Note ${cycle}` }),
      createdAt: timestamp,
    }),
  }));
  mockSnapshot({ docs: rows, metadata: { fromCache: true } });
  expect(
    callback.mock.calls.at(-1)?.[0].data.map((r: { cycle: number }) => r.cycle),
  ).toEqual([0, 1, 2]);
  mockFailure({ code: 'firestore/permission-denied' });
  expect(error).toHaveBeenLastCalledWith(
    expect.objectContaining({ code: 'FORBIDDEN' }),
  );
  stop();
  expect(mockStop).toHaveBeenCalled();
  expect(() =>
    observeContractReviews(
      {
        id: 'contract-1',
        familyId: 'family-1',
        parentUid: 'other',
        childUid: 'another',
      },
      callback,
      error,
    ),
  ).toThrow('FORBIDDEN');
});

it('upserts only the current user installation and freezes createdAt across token replacement', async () => {
  const metadata = {
    platform: 'ios',
    appVariant: 'CHILD',
    appVersion: '1.0.0',
    expoPushToken: 'ExpoPushToken[first]',
    pushEnabled: true,
  };
  mockTransaction.get.mockResolvedValue({ exists: () => false });
  await upsertCurrentPushDevice('child-1', 'installation-1', metadata);
  expect(mockTransaction.set).toHaveBeenLastCalledWith(
    'users/child-1/devices/installation-1',
    { ...metadata, createdAt: 'server-time', lastSeenAt: 'server-time' },
  );
  mockTransaction.get.mockResolvedValue({
    exists: () => true,
    data: () => ({ createdAt: timestamp, pushEnabled: false }),
  });
  await upsertCurrentPushDevice('child-1', 'installation-1', {
    ...metadata,
    expoPushToken: 'ExpoPushToken[replacement]',
  });
  expect(mockTransaction.set).toHaveBeenLastCalledWith(
    'users/child-1/devices/installation-1',
    expect.objectContaining({
      createdAt: timestamp,
      lastSeenAt: 'server-time',
      pushEnabled: true,
      expoPushToken: 'ExpoPushToken[replacement]',
    }),
  );
  await expect(
    upsertCurrentPushDevice('wrong-user', 'installation-1', metadata),
  ).rejects.toThrow();
  await expect(
    upsertCurrentPushDevice('child-1', 'bad/path', metadata),
  ).rejects.toThrow();
  await expect(
    upsertCurrentPushDevice('child-1', 'installation-1', {
      ...metadata,
      role: 'PARENT',
    }),
  ).rejects.toThrow();
});
it('confirms own deletion transaction before sign-out and propagates offline cleanup failure', async () => {
  mockTransaction.get.mockResolvedValue({ exists: () => true });
  await deleteCurrentPushDevice('child-1', 'installation-1');
  expect(mockTransaction.delete).toHaveBeenLastCalledWith(
    'users/child-1/devices/installation-1',
  );
  mockTransaction.get.mockRejectedValueOnce(Error('offline'));
  await expect(
    deleteCurrentPushDevice('child-1', 'installation-1'),
  ).rejects.toThrow('offline');
  await expect(
    deleteCurrentPushDevice('other-user', 'installation-1'),
  ).rejects.toThrow();
});

it('reads missing own preferences as enabled and confirms a role-specific save transaction', async () => {
  const value = jest.fn(),
    fail = jest.fn();
  subscribeReminderPreference('child-1', 'CHILD', value, fail);
  mockSnapshot({ exists: () => false, metadata: { fromCache: false } });
  expect(value).toHaveBeenCalledWith({ enabled: true, fromCache: false });
  mockTransaction.get.mockResolvedValue({ exists: () => false });
  await saveReminderPreference('child-1', 'CHILD', false);
  expect(mockTransaction.set).toHaveBeenLastCalledWith(
    'users/child-1/preferences/reminders',
    { deadlineRemindersEnabled: false },
  );
  mockTransaction.get.mockRejectedValueOnce(Error('offline'));
  await expect(
    saveReminderPreference('child-1', 'CHILD', true),
  ).rejects.toThrow('offline');
  await expect(saveReminderPreference('other', 'CHILD', false)).rejects.toThrow(
    'AUTH_REQUIRED',
  );
});
