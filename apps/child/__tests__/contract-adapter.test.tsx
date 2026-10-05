import {
  approveContract,
  observeReadyForReviewContracts,
  submitContractForReview,
  recordTaskCompletion,
  ContractClientError,
  observeContract,
  observeTasks,
  observeActiveContracts,
} from '@chorex/firebase-client';

const mockCallable = jest.fn();
const mockHttpsCallable = jest.fn(
  (_service: unknown, _name: string) => mockCallable,
);
const mockStop = jest.fn();
let mockSnapshot: (value: unknown) => void;
let mockFailure: (error: unknown) => void;
const mockListen = jest.fn((_ref, _options, callback, failure) => {
  mockSnapshot = callback;
  mockFailure = failure;
  return mockStop;
});
jest.mock('@react-native-firebase/app', () => ({}));
jest.mock('@react-native-firebase/auth', () => ({}));
jest.mock('@react-native-firebase/functions', () => ({
  httpsCallable: (service: unknown, name: string) =>
    mockHttpsCallable(service, name),
}));
jest.mock('@react-native-firebase/firestore', () => ({
  collection: (_db: unknown, ...path: string[]) => path.join('/'),
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  where: (...args: unknown[]) => ({ where: args }),
  orderBy: (...args: unknown[]) => ({ orderBy: args }),
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
  rewardTerms: { title: 'Cinema', type: 'EXPERIENCE' },
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
