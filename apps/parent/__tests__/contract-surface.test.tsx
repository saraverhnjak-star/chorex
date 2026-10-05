import ContractScreen from '../app/(app)/contracts/[contractId]';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ContractDetail } from '../src/contracts/ContractDetail';
import {
  ActiveContracts,
  ReadyForReviewContracts,
} from '../src/contracts/ActiveContracts';

const mockApprove = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSessionUser = { uid: 'parent-1' };
jest.mock('../src/auth/session', () => ({
  useParentSession: () => ({ user: mockSessionUser }),
}));
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
    approveContract: (...args: unknown[]) => mockApprove(...args),
    isContractClientError: (error: unknown) =>
      !!error && typeof error === 'object' && 'code' in error,
    observeReadyForReviewContracts: (
      _familyId: string,
      callback: typeof mockList,
    ) => {
      mockList = callback;
      return mockListStop;
    },
    readCurrentParentFamily: () =>
      Promise.resolve({
        profile: { uid: 'parent-1' },
        children: [{ uid: 'child-1', displayName: 'Mia' }],
      }),
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

beforeEach(() => jest.clearAllMocks());
const props = { contractId: 'contract-1', authUid: 'parent-1' };
function emitReady(fromCache = false) {
  act(() => {
    mockContract({ data: contract, fromCache });
    mockTasks({ data: [task], fromCache });
  });
}
it('renders frozen terms, persisted progress and locale deadline with no mutation or review actions', () => {
  const view = render(
    <ContractDetail {...props} childNames={{ 'child-1': 'Mia' }} />,
  );
  expect(screen.getByText('Loading Contract…')).toBeOnTheScreen();
  emitReady();
  expect(screen.getByText('Status: ACTIVE')).toBeOnTheScreen();
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
  expect(screen.getByText('Agreement with Mia')).toBeOnTheScreen();
  expect(screen.queryAllByRole('button')).toHaveLength(0);
  act(() =>
    mockTasks({ data: [{ ...task, completedCount: 2 }], fromCache: false }),
  );
  expect(screen.getByText('2 / 3 · In progress')).toBeOnTheScreen();
  act(() =>
    mockTasks({ data: [{ ...task, completedCount: 3 }], fromCache: false }),
  );
  expect(screen.getByText('3 / 3 · Complete')).toBeOnTheScreen();
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
    <ActiveContracts familyId="family-1" authUid="parent-1" />,
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

it('receives READY_FOR_REVIEW through the existing listener and exposes approval', () => {
  render(<ContractDetail {...props} />);
  emitReady();
  act(() =>
    mockContract({
      data: { ...contract, status: 'READY_FOR_REVIEW' },
      fromCache: false,
    }),
  );
  expect(
    screen.getByLabelText('Contract status: READY FOR REVIEW'),
  ).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Approve' })).toBeOnTheScreen();
  expect(mockContractStop).not.toHaveBeenCalled();
});

function emitReview() {
  act(() => {
    mockContract({
      data: { ...contract, status: 'READY_FOR_REVIEW' },
      fromCache: false,
    });
    mockTasks({ data: [{ ...task, completedCount: 3 }], fromCache: false });
  });
}
it('approval confirms deliberately, guards duplicate taps, waits for receipt and realtime, and distinguishes earning from fulfillment', async () => {
  let resolve!: (value: unknown) => void;
  mockApprove.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  render(<ContractDetail {...props} />);
  emitReview();
  fireEvent.press(screen.getByRole('button', { name: 'Approve' }));
  expect(mockApprove).not.toHaveBeenCalled();
  expect(
    screen.getByRole('header', { name: 'Approve this completed agreement?' }),
  ).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Keep reviewing' }));
  expect(screen.getByRole('button', { name: 'Approve' })).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Approve' }));
  const button = screen.getByRole('button', { name: 'Confirm approval' });
  fireEvent.press(button);
  fireEvent.press(button);
  expect(mockApprove).toHaveBeenCalledTimes(1);
  expect(button).toBeDisabled();
  expect(screen.queryByText('Approved — reward earned')).not.toBeOnTheScreen();
  expect(screen.getByText('Status: READY FOR REVIEW')).toBeOnTheScreen();
  await act(async () => resolve({}));
  expect(screen.getByText('Approved — reward earned')).toBeOnTheScreen();
  expect(
    screen.getByText('Waiting for updated Contract status…'),
  ).toBeOnTheScreen();
  act(() =>
    mockContract({
      data: { ...contract, status: 'APPROVED' },
      fromCache: false,
    }),
  );
  expect(screen.getByText('Status: APPROVED')).toBeOnTheScreen();
  expect(
    screen.queryByRole('button', { name: 'Approve' }),
  ).not.toBeOnTheScreen();
  expect(
    screen.getByText(
      'You approved this agreement. The reward is earned and still needs to be fulfilled.',
    ),
  ).toBeOnTheScreen();
});
it('ambiguous approval failure preserves status and explicit retry uses the same key', async () => {
  mockApprove
    .mockRejectedValueOnce(new Error('timeout'))
    .mockResolvedValueOnce({});
  render(<ContractDetail {...props} />);
  emitReview();
  fireEvent.press(screen.getByRole('button', { name: 'Approve' }));
  await act(async () =>
    fireEvent.press(screen.getByRole('button', { name: 'Confirm approval' })),
  );
  expect(screen.getByText('Status: READY FOR REVIEW')).toBeOnTheScreen();
  expect(screen.queryByText('Approved — reward earned')).not.toBeOnTheScreen();
  expect(
    screen.getByText(
      'We could not confirm approval. Try again to confirm the same action.',
    ),
  ).toBeOnTheScreen();
  const input = mockApprove.mock.calls[0][0];
  await act(async () =>
    fireEvent.press(screen.getByRole('button', { name: 'Confirm approval' })),
  );
  expect(mockApprove.mock.calls[1][0]).toEqual(input);
});
it('another Parent sees no approval controls', () => {
  render(<ContractDetail {...props} authUid="other" />);
  emitReview();
  expect(
    screen.queryByRole('button', { name: 'Approve' }),
  ).not.toBeOnTheScreen();
});
it('Ready-for-Review list opens stable IDs and realtime removal does not claim approval', () => {
  render(
    <ReadyForReviewContracts
      familyId="family-1"
      authUid="parent-1"
      childNames={{ 'child-1': 'Mia' }}
    />,
  );
  act(() =>
    mockList({
      data: [{ ...contract, status: 'READY_FOR_REVIEW' }],
      fromCache: false,
    }),
  );
  expect(
    screen.getByRole('header', { name: 'Ready for Review' }),
  ).toBeOnTheScreen();
  fireEvent.press(
    screen.getByRole('button', { name: 'Open Contract: Mia · Cinema' }),
  );
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/contracts/[contractId]',
    params: { contractId: 'contract-1' },
  });
  act(() => mockList({ data: [], fromCache: false }));
  expect(screen.getByText('No Contracts awaiting review.')).toBeOnTheScreen();
  expect(screen.queryByText('Approved — reward earned')).not.toBeOnTheScreen();
});
