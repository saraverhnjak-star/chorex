import ContractScreen from '../app/contracts/[contractId]';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ContractDetail } from '../src/contracts/ContractDetail';
import { ActiveContracts } from '../src/contracts/ActiveContracts';

const mockComplete = jest.fn();
const mockSubmit = jest.fn();
const mockIsContractClientError = jest.fn((_error: unknown) => false);
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSessionUser = { uid: 'child-1' };
jest.mock('../src/auth/session', () => ({
  useChildSession: () => ({ user: mockSessionUser }),
}));
const mockHistoryStop = jest.fn();
const mockHistoryObserve = jest.fn();
let mockHistory: (value: unknown) => void;
let mockHistoryError: (error: unknown) => void;
const mockReviewStop = jest.fn();
let mockReview: (value: unknown) => void;
let mockReviewError: (error: unknown) => void;
const mockContractStop = jest.fn();
const mockTasksStop = jest.fn();
const mockListStop = jest.fn();
let mockContract: (value: unknown) => void;
let mockTasks: (value: unknown) => void;
let mockError: (error: unknown) => void;
let mockList: (value: unknown) => void;
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useLocalSearchParams: () => ({ contractId: 'contract-1' }),
}));
jest.mock('@chorex/firebase-client', () => {
  const hooks = jest.requireActual(
    '../../../packages/firebase-client/src/contractHooks',
  );
  return {
    ...hooks,
    observeContractReviews: (
      _contract: unknown,
      callback: typeof mockHistory,
      onError: typeof mockHistoryError,
    ) => {
      mockHistoryObserve(_contract);
      mockHistory = callback;
      mockHistoryError = onError;
      return mockHistoryStop;
    },
    observeCurrentContractReview: (
      _contract: unknown,
      callback: typeof mockReview,
      onError: typeof mockReviewError,
    ) => {
      mockReview = callback;
      mockReviewError = onError;
      return mockReviewStop;
    },
    submitContractForReview: (input: unknown) => mockSubmit(input),
    recordTaskCompletion: (input: unknown) => mockComplete(input),
    isContractClientError: (error: unknown) => mockIsContractClientError(error),
    contractClientErrorCodes: {
      authRequired: 'AUTH_REQUIRED',
      forbidden: 'FORBIDDEN',
      familyMembershipRequired: 'FAMILY_MEMBERSHIP_REQUIRED',
      wrongActorRole: 'WRONG_ACTOR_ROLE',
      invalidState: 'INVALID_STATE',
      taskAlreadyComplete: 'TASK_ALREADY_COMPLETE',
      tasksIncomplete: 'TASKS_INCOMPLETE',
      contractNotFound: 'CONTRACT_NOT_FOUND',
      taskNotFound: 'TASK_NOT_FOUND',
      networkUnavailable: 'NETWORK_UNAVAILABLE',
      idempotencyConflict: 'IDEMPOTENCY_CONFLICT',
      invalidInput: 'INVALID_INPUT',
    },
    observeContract: (
      _id: string,
      callback: typeof mockContract,
      onError: typeof mockError,
    ) => {
      mockContract = callback;
      mockError = onError;
      return mockContractStop;
    },
    observeTasks: (_id: string, callback: typeof mockTasks) => {
      mockTasks = callback;
      return mockTasksStop;
    },
    observeActiveContracts: (_familyId: string, callback: typeof mockList) => {
      mockList = callback;
      return mockListStop;
    },
  };
});
const contract = {
  id: 'contract-1',
  familyId: 'family-1',
  parentUid: 'parent-1',
  childUid: 'child-1',
  source: { type: 'OFFER', offerId: 'offer-1', revisionId: 'revision-2' },
  rewardTerms: {
    title: 'Cinema',
    type: 'EXPERIENCE',
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

beforeEach(() => {
  jest.clearAllMocks();
  mockComplete.mockReset();
  mockSubmit.mockReset();
  mockIsContractClientError.mockReturnValue(false);
});
const props = { contractId: 'contract-1', authUid: 'child-1' };
function emitReady(fromCache = false) {
  act(() => {
    mockContract({ data: contract, fromCache });
    mockTasks({ data: [task], fromCache });
  });
}
it('renders frozen terms, persisted progress and locale deadline', () => {
  const view = render(<ContractDetail {...props} />);
  expect(screen.getByText('Loading Contract…')).toBeOnTheScreen();
  emitReady();
  expect(screen.getByLabelText('Contract status: ACTIVE')).toBeOnTheScreen();
  expect(
    screen.getByLabelText('Dishwasher. After dinner. 0 of 3. Not started.'),
  ).toBeOnTheScreen();
  expect(screen.getByText('0 / 3 · Not started')).toBeOnTheScreen();
  expect(screen.getByText('Promised reward')).toBeOnTheScreen();
  expect(screen.getByText('Cinema · EXPERIENCE')).toBeOnTheScreen();
  expect(screen.getByText('Choose a movie')).toBeOnTheScreen();
  expect(
    screen.getByLabelText(
      `Deadline: ${new Date(contract.deadlineAt).toLocaleString()}`,
    ),
  ).toBeOnTheScreen();

  expect(
    screen.getByRole('button', { name: 'Mark one done: Dishwasher' }),
  ).toBeOnTheScreen();
  act(() =>
    mockTasks({ data: [{ ...task, completedCount: 2 }], fromCache: false }),
  );
  expect(screen.getByText('2 / 3 · In progress')).toBeOnTheScreen();
  act(() =>
    mockTasks({ data: [{ ...task, completedCount: 3 }], fromCache: false }),
  );
  expect(screen.getByText('3 / 3 · Complete')).toBeOnTheScreen();
  expect(
    screen.queryByRole('button', { name: 'Mark one done: Dishwasher' }),
  ).toBeNull();
  view.unmount();
  expect(mockContractStop).toHaveBeenCalled();
  expect(mockTasksStop).toHaveBeenCalled();
});
it('distinguishes cached terms, uncached missing data, empty tasks and permission errors', () => {
  render(<ContractDetail {...props} />);
  emitReady(true);
  expect(
    screen.getByText('Showing saved data. Updates may be pending.'),
  ).toBeOnTheScreen();
  act(() => mockTasks({ data: [], fromCache: true }));
  expect(screen.getByText('No tasks are available.')).toBeOnTheScreen();
  act(() => mockContract({ data: null, fromCache: true }));
  expect(
    screen.getByText(
      'No cached Contract is available yet. Connect to the internet to load it.',
    ),
  ).toBeOnTheScreen();
  act(() => mockContract({ data: null, fromCache: false }));
  expect(screen.getByText('Contract not found.')).toBeOnTheScreen();
  act(() => mockError(new Error('permission-denied')));
  expect(
    screen.getByText(
      'This Contract could not be loaded or is unavailable to your account.',
    ),
  ).toBeOnTheScreen();
  expect(screen.queryByText('Cinema · EXPERIENCE')).toBeNull();
});
it('clears old reads on ID/auth changes and ignores callbacks after cleanup', () => {
  const view = render(<ContractDetail {...props} />);
  emitReady();
  const oldContract = mockContract;
  const oldTasks = mockTasks;
  view.rerender(<ContractDetail contractId="contract-2" authUid="new-user" />);
  expect(screen.getByText('Loading Contract…')).toBeOnTheScreen();
  act(() => {
    oldContract({ data: contract, fromCache: false });
    oldTasks({ data: [task], fromCache: false });
  });
  expect(screen.queryByText('Cinema · EXPERIENCE')).toBeNull();
});
it('rejects cross-family tasks instead of rendering mixed snapshots', () => {
  render(<ContractDetail {...props} />);
  act(() => {
    mockContract({ data: contract, fromCache: false });
    mockTasks({
      data: [{ ...task, familyId: 'other-family' }],
      fromCache: false,
    });
  });
  expect(
    screen.getByText(
      'This Contract could not be loaded or is unavailable to your account.',
    ),
  ).toBeOnTheScreen();
});
it('exposes multiple Contracts in realtime and navigates by stable Contract ID', () => {
  const view = render(
    <ActiveContracts familyId="family-1" authUid="child-1" />,
  );
  expect(screen.getByText('Loading Contracts…')).toBeOnTheScreen();
  act(() => mockList({ data: [], fromCache: false }));
  expect(screen.getByText('No active Contracts yet.')).toBeOnTheScreen();
  act(() =>
    mockList({
      data: [
        contract,
        {
          ...contract,
          id: 'contract-2',
          rewardTerms: { ...contract.rewardTerms, title: 'Museum' },
        },
      ],
      fromCache: false,
    }),
  );
  fireEvent.press(
    screen.getByRole('button', { name: 'Open Contract: Cinema' }),
  );
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/contracts/[contractId]',
    params: { contractId: 'contract-1' },
  });
  expect(
    screen.getByRole('button', { name: 'Open Contract: Museum' }),
  ).toBeOnTheScreen();
  view.unmount();
  expect(mockListStop).toHaveBeenCalled();
});

it('opens the stable-ID detail route with a heading and accessible home navigation', async () => {
  render(<ContractScreen />);
  await act(async () => {});
  expect(screen.getByRole('header', { name: 'Contract' })).toBeOnTheScreen();
  emitReady();
  expect(screen.getByText('Cinema · EXPERIENCE')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Back to home' }));
  expect(mockReplace).toHaveBeenCalledWith('/');
});

it('prevents rapid taps and waits for realtime counts after backend confirmation', async () => {
  let resolve: (value: unknown) => void = () => {};
  mockComplete.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(<ContractDetail {...props} />);
  emitReady();
  const button = screen.getByRole('button', {
    name: 'Mark one done: Dishwasher',
  });
  fireEvent.press(button);
  fireEvent.press(button);
  expect(mockComplete).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole('button', { name: 'Mark one done: Dishwasher' }),
  ).toBeDisabled();
  expect(screen.getByText('0 / 3 · Not started')).toBeOnTheScreen();
  const firstInput = mockComplete.mock.calls[0][0];
  expect(firstInput).toEqual({
    contractId: 'contract-1',
    taskId: 'task-1',
    idempotencyKey: expect.any(String),
  });
  await act(async () => resolve({ task: { ...task, completedCount: 1 } }));
  expect(screen.getByText('0 / 3 · Not started')).toBeOnTheScreen();
  expect(
    screen.getByText('Completion recorded. Waiting for updated progress…'),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole('button', { name: 'Mark one done: Dishwasher' }),
  ).toBeDisabled();
  act(() =>
    mockTasks({ data: [{ ...task, completedCount: 1 }], fromCache: false }),
  );
  expect(screen.getByText('1 / 3 · In progress')).toBeOnTheScreen();
  expect(
    screen.getByRole('button', { name: 'Mark one done: Dishwasher' }),
  ).toBeEnabled();
  mockComplete.mockResolvedValueOnce({ task: { ...task, completedCount: 2 } });
  await act(async () =>
    fireEvent.press(
      screen.getByRole('button', { name: 'Mark one done: Dishwasher' }),
    ),
  );
  expect(mockComplete.mock.calls[1][0].idempotencyKey).not.toBe(
    firstInput.idempotencyKey,
  );
});
it('offline/backend failure leaves cached counts unchanged and explicit retry reuses the same key', async () => {
  mockIsContractClientError.mockReturnValue(true);
  mockComplete
    .mockRejectedValueOnce({ code: 'NETWORK_UNAVAILABLE' })
    .mockResolvedValueOnce({ task: { ...task, completedCount: 1 } });
  render(<ContractDetail {...props} />);
  emitReady(true);
  await act(async () =>
    fireEvent.press(
      screen.getByRole('button', { name: 'Mark one done: Dishwasher' }),
    ),
  );
  expect(
    screen.getByText(
      'Unable to confirm completion. Check your connection and try again. Your displayed progress has not been changed locally.',
    ),
  ).toBeOnTheScreen();
  expect(screen.getByText('0 / 3 · Not started')).toBeOnTheScreen();
  expect(
    screen.queryByText('Completion recorded. Waiting for updated progress…'),
  ).toBeNull();
  await act(async () =>
    fireEvent.press(
      screen.getByRole('button', { name: 'Mark one done: Dishwasher' }),
    ),
  );
  expect(mockComplete.mock.calls[1][0]).toEqual(mockComplete.mock.calls[0][0]);
  expect(screen.getByText('0 / 3 · Not started')).toBeOnTheScreen();
});
it('one-time tasks expose Mark done and non-ACTIVE/other actor surfaces remain read-only', () => {
  render(<ContractDetail {...props} />);
  act(() => {
    mockContract({ data: contract, fromCache: false });
    mockTasks({ data: [{ ...task, targetCount: 1 }], fromCache: false });
  });
  expect(
    screen.getByRole('button', { name: 'Mark done: Dishwasher' }),
  ).toBeOnTheScreen();
  act(() =>
    mockTasks({
      data: [{ ...task, targetCount: 1, completedCount: 1 }],
      fromCache: false,
    }),
  );
  expect(screen.getByText('1 / 1 · Complete')).toBeOnTheScreen();
  expect(
    screen.queryByRole('button', { name: 'Mark done: Dishwasher' }),
  ).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Submit for review' }),
  ).toBeEnabled();
  act(() => {
    mockTasks({ data: [task], fromCache: false });
    mockContract({
      data: { ...contract, status: 'CHANGES_REQUESTED' },
      fromCache: false,
    });
  });
  expect(screen.queryAllByRole('button')).toHaveLength(0);
});

it.each([
  ['AUTH_REQUIRED', 'Your Child session has ended. Pair this device again.'],
  ['FORBIDDEN', 'You cannot record progress on this task.'],
  ['WRONG_ACTOR_ROLE', 'You cannot record progress on this task.'],
  ['FAMILY_MEMBERSHIP_REQUIRED', 'You cannot record progress on this task.'],
  [
    'INVALID_STATE',
    'This Contract is no longer active. Progress updates are unavailable.',
  ],
  [
    'TASK_ALREADY_COMPLETE',
    'This task is already complete. Its progress will update automatically.',
  ],
  ['CONTRACT_NOT_FOUND', 'This Contract or task is no longer available.'],
  ['TASK_NOT_FOUND', 'This Contract or task is no longer available.'],
  [
    'IDEMPOTENCY_CONFLICT',
    'This retry does not match the original action. Reopen the Contract before trying again.',
  ],
])(
  'maps %s without changing authoritative counts or displaying backend exceptions',
  async (code, message) => {
    mockIsContractClientError.mockReturnValue(true);
    mockComplete.mockRejectedValueOnce({
      code,
      message: 'private backend exception',
    });
    render(<ContractDetail {...props} />);
    emitReady();
    await act(async () =>
      fireEvent.press(
        screen.getByRole('button', { name: 'Mark one done: Dishwasher' }),
      ),
    );
    expect(screen.getByText(message)).toBeOnTheScreen();
    expect(screen.getByText('0 / 3 · Not started')).toBeOnTheScreen();
    expect(screen.queryByText('private backend exception')).toBeNull();
  },
);

function completeTasks() {
  emitReady();
  act(() =>
    mockTasks({ data: [{ ...task, completedCount: 3 }], fromCache: false }),
  );
}
it('submission requires nonempty complete tasks and deliberate confirmation, with cancellation', () => {
  render(<ContractDetail {...props} />);
  emitReady();
  expect(
    screen.queryByRole('button', { name: 'Submit for review' }),
  ).toBeNull();
  expect(
    screen.getByText('Complete all tasks before submitting for review.'),
  ).toBeOnTheScreen();
  act(() => mockTasks({ data: [], fromCache: false }));
  expect(
    screen.queryByRole('button', { name: 'Submit for review' }),
  ).toBeNull();
  completeTasks();
  fireEvent.press(screen.getByRole('button', { name: 'Submit for review' }));
  expect(
    screen.getByRole('header', { name: 'Send this Contract for review?' }),
  ).toBeOnTheScreen();
  expect(mockSubmit).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Keep checking' }));
  expect(
    screen.getByRole('button', { name: 'Submit for review' }),
  ).toBeOnTheScreen();
});
it('submission pending prevents duplicate taps; backend receipt does not optimistically alter status; realtime removes actions', async () => {
  let resolve: (value: unknown) => void = () => {};
  mockSubmit.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(<ContractDetail {...props} />);
  completeTasks();
  fireEvent.press(screen.getByRole('button', { name: 'Submit for review' }));
  const button = screen.getByRole('button', { name: 'Confirm submission' });
  fireEvent.press(button);
  fireEvent.press(button);
  expect(mockSubmit).toHaveBeenCalledTimes(1);
  expect(button).toBeDisabled();
  expect(screen.queryByText('Sent for review')).toBeNull();
  expect(screen.getByLabelText('Contract status: ACTIVE')).toBeOnTheScreen();
  await act(async () =>
    resolve({ contract: { ...contract, status: 'READY_FOR_REVIEW' } }),
  );
  expect(screen.getByText('Sent for review')).toBeOnTheScreen();
  expect(screen.getByLabelText('Contract status: ACTIVE')).toBeOnTheScreen();
  expect(
    screen.getByText('Waiting for updated Contract status…'),
  ).toBeOnTheScreen();
  act(() =>
    mockContract({
      data: { ...contract, status: 'READY_FOR_REVIEW' },
      fromCache: false,
    }),
  );
  expect(
    screen.getByLabelText('Contract status: READY FOR REVIEW'),
  ).toBeOnTheScreen();
  expect(
    screen.getByText('Your Parent now needs to review this agreement.'),
  ).toBeOnTheScreen();
  expect(screen.queryAllByRole('button')).toHaveLength(0);
  expect(screen.getByText('3 / 3 · Complete')).toBeOnTheScreen();
});
it.each([
  [
    'NETWORK_UNAVAILABLE',
    'Unable to confirm submission. Check your connection and try again. Your Contract status has not been changed locally.',
  ],
  ['TASKS_INCOMPLETE', 'Complete all tasks before submitting for review.'],
  [
    'INVALID_STATE',
    'This Contract is no longer active. Its status will update automatically.',
  ],
  ['FORBIDDEN', 'You cannot submit this Contract.'],
  [
    'UNKNOWN_CONTRACT_FAILURE',
    'We could not confirm submission. Try again to confirm the same action.',
  ],
])(
  'submission %s leaves status unchanged and preserves retry identity',
  async (code, message) => {
    mockIsContractClientError.mockReturnValue(true);
    mockSubmit.mockRejectedValueOnce({ code }).mockResolvedValueOnce({
      contract: { ...contract, status: 'READY_FOR_REVIEW' },
    });
    render(<ContractDetail {...props} />);
    completeTasks();
    fireEvent.press(screen.getByRole('button', { name: 'Submit for review' }));
    await act(async () =>
      fireEvent.press(
        screen.getByRole('button', { name: 'Confirm submission' }),
      ),
    );
    expect(screen.getByText(message)).toBeOnTheScreen();
    expect(screen.getByLabelText('Contract status: ACTIVE')).toBeOnTheScreen();
    expect(screen.queryByText('Sent for review')).toBeNull();
    await act(async () =>
      fireEvent.press(
        screen.getByRole('button', { name: 'Confirm submission' }),
      ),
    );
    expect(mockSubmit.mock.calls[1][0]).toEqual(mockSubmit.mock.calls[0][0]);
  },
);
it('READY_FOR_REVIEW received externally hides all progress/submission actions', () => {
  render(<ContractDetail {...props} />);
  emitReady();
  act(() =>
    mockContract({
      data: { ...contract, status: 'READY_FOR_REVIEW' },
      fromCache: false,
    }),
  );
  expect(screen.queryAllByRole('button')).toHaveLength(0);
  expect(
    screen.getByText('Your Parent now needs to review this agreement.'),
  ).toBeOnTheScreen();
});

it('realtime approval communicates an earned, pending reward without execution actions', () => {
  render(<ContractDetail {...props} />);
  act(() => {
    mockContract({
      data: { ...contract, status: 'APPROVED' },
      fromCache: false,
    });
    mockTasks({
      data: [{ ...task, completedCount: task.targetCount }],
      fromCache: false,
    });
  });
  expect(screen.getByLabelText('Contract status: APPROVED')).toBeOnTheScreen();
  expect(
    screen.getByText(
      'Your Parent approved this agreement. Your reward is earned and waiting to be fulfilled.',
    ),
  ).toBeOnTheScreen();
  expect(
    screen.queryByRole('button', { name: 'Submit for review' }),
  ).not.toBeOnTheScreen();
  expect(
    screen.queryByRole('button', { name: 'Mark one done' }),
  ).not.toBeOnTheScreen();
});

it('realtime requested changes displays authoritative cached feedback and read-only task progress', () => {
  const view = render(<ContractDetail {...props} />);
  emitReady();
  act(() =>
    mockContract({
      data: { ...contract, status: 'CHANGES_REQUESTED' },
      fromCache: false,
    }),
  );
  expect(
    screen.getByLabelText('Contract status: CHANGES REQUESTED'),
  ).toBeOnTheScreen();
  expect(screen.getByText('Loading feedback…')).toBeOnTheScreen();
  act(() =>
    mockReview({ data: { note: 'Please check the result.' }, fromCache: true }),
  );
  expect(screen.getByText('Please check the result.')).toBeOnTheScreen();
  expect(
    screen.getByText('Showing saved feedback. Updates may be pending.'),
  ).toBeOnTheScreen();
  expect(
    screen.getByText('Changes were requested. The reward has not been earned.'),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole('button', { name: 'Resubmit for review' }),
  ).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Mark one done' })).toBeNull();
  const oldReview = mockReview;
  view.rerender(<ContractDetail {...props} contractId="another" />);
  expect(mockReviewStop).toHaveBeenCalled();
  act(() => oldReview({ data: { note: 'Stale feedback' }, fromCache: false }));
  expect(screen.queryByText('Stale feedback')).not.toBeOnTheScreen();
});
it('feedback listener errors preserve visible Contract state without inventing feedback', () => {
  render(<ContractDetail {...props} />);
  emitReady();
  act(() =>
    mockContract({
      data: { ...contract, status: 'CHANGES_REQUESTED' },
      fromCache: false,
    }),
  );
  act(() => mockReviewError(new Error('denied')));
  expect(
    screen.getByLabelText('Contract status: CHANGES REQUESTED'),
  ).toBeOnTheScreen();
  expect(
    screen.getByText(
      'Feedback could not be loaded. Reopen this Contract to try again.',
    ),
  ).toBeOnTheScreen();
});

function emitCorrection(cycle = 0) {
  completeTasks();
  act(() =>
    mockContract({
      data: { ...contract, status: 'CHANGES_REQUESTED', reviewCycle: cycle },
      fromCache: false,
    }),
  );
  act(() =>
    mockReview({
      data: { note: 'Please check the result.' },
      fromCache: false,
    }),
  );
}
it('resubmission confirms addressed feedback, guards pending taps and waits for backend/realtime', async () => {
  let resolve: (value: unknown) => void = () => {};
  mockSubmit.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(<ContractDetail {...props} />);
  emitCorrection();
  expect(screen.getByText('3 / 3 · Complete')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Mark one done' })).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Resubmit for review' }));
  expect(
    screen.getByRole('header', { name: 'Send this Contract back for review?' }),
  ).toBeOnTheScreen();
  expect(
    screen.getByText(
      'Confirm that you have addressed your Parent’s feedback. Your completed task progress stays unchanged.',
    ),
  ).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Keep checking' }));
  fireEvent.press(screen.getByRole('button', { name: 'Resubmit for review' }));
  const button = screen.getByRole('button', { name: 'Confirm resubmission' });
  fireEvent.press(button);
  fireEvent.press(button);
  expect(mockSubmit).toHaveBeenCalledTimes(1);
  expect(button).toBeDisabled();
  expect(screen.queryByText('Sent back for review')).toBeNull();
  expect(
    screen.getByLabelText('Contract status: CHANGES REQUESTED'),
  ).toBeOnTheScreen();
  await act(async () =>
    resolve({
      contract: { ...contract, status: 'READY_FOR_REVIEW', reviewCycle: 1 },
    }),
  );
  expect(screen.getByText('Sent back for review')).toBeOnTheScreen();
  expect(
    screen.getByLabelText('Contract status: CHANGES REQUESTED'),
  ).toBeOnTheScreen();
  act(() =>
    mockContract({
      data: { ...contract, status: 'READY_FOR_REVIEW', reviewCycle: 1 },
      fromCache: false,
    }),
  );
  expect(
    screen.getByLabelText('Contract status: READY FOR REVIEW'),
  ).toBeOnTheScreen();
  expect(screen.queryAllByRole('button')).toHaveLength(0);
  expect(screen.queryByText('Please check the result.')).toBeNull();
  expect(screen.getByText('3 / 3 · Complete')).toBeOnTheScreen();
});
it('resubmission failure keeps correction state and same-key retry; a new round uses a fresh key', async () => {
  mockSubmit.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({});
  render(<ContractDetail {...props} />);
  emitCorrection();
  fireEvent.press(screen.getByRole('button', { name: 'Resubmit for review' }));
  await act(async () =>
    fireEvent.press(
      screen.getByRole('button', { name: 'Confirm resubmission' }),
    ),
  );
  expect(
    screen.getByLabelText('Contract status: CHANGES REQUESTED'),
  ).toBeOnTheScreen();
  expect(screen.queryByText('Sent back for review')).toBeNull();
  await act(async () =>
    fireEvent.press(
      screen.getByRole('button', { name: 'Confirm resubmission' }),
    ),
  );
  expect(mockSubmit.mock.calls[0][0]).toEqual(mockSubmit.mock.calls[1][0]);
  act(() =>
    mockContract({
      data: { ...contract, status: 'READY_FOR_REVIEW', reviewCycle: 1 },
      fromCache: false,
    }),
  );
  emitCorrection(1);
  fireEvent.press(screen.getByRole('button', { name: 'Resubmit for review' }));
  await act(async () =>
    fireEvent.press(
      screen.getByRole('button', { name: 'Confirm resubmission' }),
    ),
  );
  expect(mockSubmit.mock.calls[2][0].idempotencyKey).not.toBe(
    mockSubmit.mock.calls[0][0].idempotencyKey,
  );
});

const historicalReviews = [0, 1, 2].map((cycle) => ({
  id: `review-${cycle}`,
  familyId: contract.familyId,
  contractId: contract.id,
  reviewerUid: contract.parentUid,
  cycle,
  decision: cycle === 2 ? 'APPROVE' : 'REQUEST_CHANGES',
  ...(cycle === 2 ? {} : { note: `Historical feedback ${cycle}` }),
  createdAt: contract.createdAt,
}));
it('shows accessible loading, empty and error history without creating a pending review', () => {
  render(<ContractDetail {...props} />);
  emitReady();
  expect(
    screen.getByRole('header', { name: 'Review history' }),
  ).toBeOnTheScreen();
  expect(screen.getByText('Loading review history…')).toBeOnTheScreen();
  act(() => mockHistory({ data: [], fromCache: false }));
  expect(screen.getByText('No reviews yet')).toBeOnTheScreen();
  expect(screen.queryByText('Review 1: Approved')).not.toBeOnTheScreen();
  act(() => mockHistoryError(new Error('read failure')));
  expect(
    screen.getByText(
      'Review history could not be loaded. Reopen this Contract to try again.',
    ),
  ).toBeOnTheScreen();
  expect(mockHistoryStop).toHaveBeenCalled();
  act(() => mockHistory({ data: historicalReviews, fromCache: false }));
  expect(
    screen.queryByText('Review 1: Changes requested'),
  ).not.toBeOnTheScreen();
});
it('renders all immutable rounds with one-based labels, notes and realtime final approval', () => {
  render(<ContractDetail {...props} />);
  emitReady();
  act(() =>
    mockHistory({ data: historicalReviews.slice(0, 2), fromCache: true }),
  );
  expect(screen.getByText('Historical feedback 0')).toBeOnTheScreen();
  expect(screen.getByText('Historical feedback 1')).toBeOnTheScreen();
  expect(
    screen.getByText('Showing saved review history. Updates may be pending.'),
  ).toBeOnTheScreen();
  act(() => {
    mockContract({
      data: {
        ...contract,
        status: 'APPROVED',
        reviewCycle: 2,
        approvedAt: contract.createdAt,
      },
      fromCache: false,
    });
    mockHistory({ data: historicalReviews, fromCache: false });
  });
  expect(
    screen.queryByRole('button', { name: 'Approve' }),
  ).not.toBeOnTheScreen();
  expect(
    screen.queryByRole('button', { name: 'Mark done' }),
  ).not.toBeOnTheScreen();
  const headings = screen
    .getAllByRole('header')
    .map((h) => h.props.children)
    .filter((c) => Array.isArray(c) && c[0] === 'Review ');
  expect(headings.map((c) => c[1])).toEqual([1, 2, 3]);
  expect(screen.getByText('Review 3: Approved')).toBeOnTheScreen();
  expect(historicalReviews.map((r) => r.cycle)).toEqual([0, 1, 2]);
  expect(
    screen.queryByText('Showing saved review history. Updates may be pending.'),
  ).not.toBeOnTheScreen();
  expect(mockHistoryObserve).toHaveBeenCalledTimes(1);
});
it('retains the history listener across cycles/statuses, clears it on identity change and ignores stale callbacks', () => {
  const view = render(<ContractDetail {...props} />);
  emitReady();
  act(() =>
    mockHistory({ data: historicalReviews.slice(0, 1), fromCache: false }),
  );
  act(() =>
    mockContract({
      data: { ...contract, status: 'READY_FOR_REVIEW', reviewCycle: 1 },
      fromCache: false,
    }),
  );
  expect(screen.getByText('Historical feedback 0')).toBeOnTheScreen();
  expect(mockHistoryObserve).toHaveBeenCalledTimes(1);
  const old = mockHistory;
  view.rerender(<ContractDetail contractId="another" authUid="new-user" />);
  expect(mockHistoryStop).toHaveBeenCalled();
  act(() => old({ data: historicalReviews, fromCache: false }));
  expect(screen.queryByText('Historical feedback 0')).not.toBeOnTheScreen();
});
it('distinguishes the current request from historical context and adds no history mutation controls', () => {
  render(<ContractDetail {...props} />);
  emitReady();
  act(() =>
    mockContract({
      data: { ...contract, status: 'CHANGES_REQUESTED' },
      fromCache: false,
    }),
  );
  act(() => mockReview({ data: historicalReviews[0], fromCache: false }));
  act(() =>
    mockHistory({ data: historicalReviews.slice(0, 1), fromCache: false }),
  );
  expect(
    screen.getByRole('header', { name: 'Current request' }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole('header', { name: 'Review history' }),
  ).toBeOnTheScreen();
  expect(screen.getAllByText('Historical feedback 0')).toHaveLength(2);
  for (const name of ['Edit feedback', 'Reply', 'Acknowledge', 'Delete review'])
    expect(screen.queryByRole('button', { name })).not.toBeOnTheScreen();
});

it('keeps every Contract reachable when Home shows a compact preview', () => {
  render(<ActiveContracts familyId="family-1" authUid="child-1" />);
  const third = {
    ...contract,
    id: 'contract-3',
    rewardTerms: {
      ...contract.rewardTerms,
      title: 'A longer family reward title that wraps across the Home row',
    },
  };
  act(() =>
    mockList({
      data: [contract, { ...contract, id: 'contract-2' }, third],
      fromCache: false,
    }),
  );
  expect(
    screen.queryByRole('button', {
      name: `Open Contract: ${third.rewardTerms.title}`,
    }),
  ).toBeNull();
  fireEvent.press(
    screen.getByRole('button', { name: 'View all Contracts (3)' }),
  );
  fireEvent.press(
    screen.getByRole('button', {
      name: `Open Contract: ${third.rewardTerms.title}`,
    }),
  );
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/contracts/[contractId]',
    params: { contractId: 'contract-3' },
  });
  fireEvent.press(screen.getByRole('button', { name: 'Show fewer Contracts' }));
  expect(
    screen.queryByRole('button', {
      name: `Open Contract: ${third.rewardTerms.title}`,
    }),
  ).toBeNull();
});
