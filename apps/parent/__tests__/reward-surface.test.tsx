import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { PendingRewards } from '../src/rewards/PendingRewards';
import { RewardDetail } from '../src/rewards/RewardDetail';
import { RewardClientError } from '@chorex/firebase-client';
const mockFulfill = jest.fn(),
  mockPush = jest.fn(),
  mockStop = jest.fn();
let mockList: (value: unknown) => void,
  mockReward: (value: unknown) => void,
  mockFailure: (error: unknown) => void;
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@chorex/firebase-client', () => ({
  ...jest.requireActual('../../../packages/firebase-client/src/rewardHooks'),
  RewardClientError: class extends Error {
    code: string;
    constructor(mockCode: string) {
      super(mockCode);
      this.code = mockCode;
    }
  },
  fulfillReward: (input: unknown) => mockFulfill(input),
  observePendingRewards: (_id: string, callback: typeof mockList) => {
    mockList = callback;
    return mockStop;
  },
  observeReward: (
    _id: string,
    callback: typeof mockReward,
    failure: typeof mockFailure,
  ) => {
    mockReward = callback;
    mockFailure = failure;
    return mockStop;
  },
}));
const reward = {
  id: 'reward-1',
  familyId: 'family-1',
  contractId: 'contract-1',
  parentUid: 'parent-1',
  childUid: 'child-1',
  terms: {
    title: 'Cinema',
    description: 'Choose a movie',
    type: 'EXPERIENCE' as const,
  },
  status: 'PENDING_FULFILLMENT' as const,
  earnedAt: '2026-10-05T10:00:00.000Z',
};
beforeEach(() => {
  jest.clearAllMocks();
  mockFulfill.mockResolvedValue({});
});
function ready() {
  act(() => mockReward({ data: reward, fromCache: false }));
}
it('renders multiple obligations and empty/cache/error states; realtime removes fulfilled Reward', () => {
  render(
    <PendingRewards
      familyId="family-1"
      authUid="parent-1"
      childNames={{ 'child-1': 'Mia', 'child-2': 'Leo' }}
    />,
  );
  act(() =>
    mockList({
      data: [
        reward,
        {
          ...reward,
          id: 'reward-2',
          childUid: 'child-2',
          terms: { ...reward.terms, title: 'Park' },
        },
      ],
      fromCache: true,
    }),
  );
  expect(
    screen.getByRole('header', { name: 'Rewards to fulfill' }),
  ).toBeOnTheScreen();
  expect(screen.getByText('Reward for Mia')).toBeOnTheScreen();
  expect(screen.getByText('Reward for Leo')).toBeOnTheScreen();
  expect(screen.getAllByText('Earned — waiting for Parent')).toHaveLength(2);
  fireEvent.press(
    screen.getByRole('button', { name: 'Open reward: Mia · Cinema' }),
  );
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/rewards/[rewardId]',
    params: { rewardId: 'reward-1' },
  });
  act(() => mockList({ data: [], fromCache: false }));
  expect(
    screen.getByText('No rewards waiting to be fulfilled'),
  ).toBeOnTheScreen();
});
it('deliberate confirmation is cancellable, pending blocks duplicate taps and success waits for backend and listener', async () => {
  let resolve: (value: unknown) => void = () => {};
  mockFulfill.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(<RewardDetail rewardId="reward-1" authUid="parent-1" />);
  ready();
  fireEvent.press(screen.getByRole('button', { name: 'Mark as fulfilled' }));
  expect(
    screen.getByRole('header', { name: 'Record this reward as delivered?' }),
  ).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Keep checking' }));
  expect(mockFulfill).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Mark as fulfilled' }));
  const button = screen.getByRole('button', { name: 'Confirm fulfillment' });
  fireEvent.press(button);
  fireEvent.press(button);
  expect(mockFulfill).toHaveBeenCalledTimes(1);
  expect(button).toBeDisabled();
  expect(screen.queryByText('Reward fulfilled')).toBeNull();
  await act(async () => resolve({}));
  expect(screen.getByText('Reward fulfilled')).toBeOnTheScreen();
  expect(screen.getByText('Earned — waiting for Parent')).toBeOnTheScreen();
  expect(
    screen.getByText('Waiting for updated reward status…'),
  ).toBeOnTheScreen();
  act(() =>
    mockReward({
      data: {
        ...reward,
        status: 'FULFILLED',
        fulfilledAt: reward.earnedAt,
        fulfilledBy: 'parent-1',
      },
      fromCache: false,
    }),
  );
  expect(screen.getByText('Fulfilled — delivered')).toBeOnTheScreen();
  expect(screen.queryAllByRole('button')).toHaveLength(0);
});
it('offline failure never claims delivery and retry keeps the original key', async () => {
  mockFulfill
    .mockRejectedValueOnce(new RewardClientError('NETWORK_UNAVAILABLE'))
    .mockResolvedValueOnce({});
  render(<RewardDetail rewardId="reward-1" authUid="parent-1" />);
  ready();
  fireEvent.press(screen.getByRole('button', { name: 'Mark as fulfilled' }));
  await act(async () =>
    fireEvent.press(
      screen.getByRole('button', { name: 'Confirm fulfillment' }),
    ),
  );
  expect(screen.getByText('Earned — waiting for Parent')).toBeOnTheScreen();
  expect(screen.queryByText('Reward fulfilled')).toBeNull();
  expect(
    screen.getByText(
      'Unable to confirm fulfillment. Check your connection and try again. The reward has not been changed locally.',
    ),
  ).toBeOnTheScreen();
  await act(async () =>
    fireEvent.press(
      screen.getByRole('button', { name: 'Confirm fulfillment' }),
    ),
  );
  expect(mockFulfill.mock.calls[0][0]).toEqual(mockFulfill.mock.calls[1][0]);
});
it('scope changes clear state and ignore stale listeners; unrelated Parent has no action', () => {
  const view = render(
    <RewardDetail rewardId="reward-1" authUid="other-parent" />,
  );
  ready();
  expect(
    screen.queryByRole('button', { name: 'Mark as fulfilled' }),
  ).toBeNull();
  const old = mockReward;
  view.rerender(<RewardDetail rewardId="another" authUid="parent-1" />);
  expect(mockStop).toHaveBeenCalled();
  act(() => old({ data: reward, fromCache: false }));
  expect(screen.queryByText('Cinema')).toBeNull();
  act(() => mockFailure(new Error('denied')));
  expect(
    screen.getByText(
      'This reward could not be loaded or is unavailable to your account.',
    ),
  ).toBeOnTheScreen();
});
