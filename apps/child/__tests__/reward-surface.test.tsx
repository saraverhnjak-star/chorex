import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { EarnedRewards } from '../src/rewards/EarnedRewards';
import { RewardDetail } from '../src/rewards/RewardDetail';
const mockPush = jest.fn(),
  mockStop = jest.fn();
let mockList: (value: unknown) => void,
  mockReward: (value: unknown) => void,
  mockFailure: (error: unknown) => void;
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@chorex/firebase-client', () => ({
  ...jest.requireActual('../../../packages/firebase-client/src/rewardHooks'),
  observeEarnedRewards: (
    _id: string,
    callback: typeof mockList,
    failure: typeof mockFailure,
  ) => {
    mockList = callback;
    mockFailure = failure;
    return mockStop;
  },
  observeReward: (_id: string, callback: typeof mockReward) => {
    mockReward = callback;
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
beforeEach(() => jest.clearAllMocks());
it('earned Rewards distinguish pending from delivered and update without Child mutations', () => {
  render(<EarnedRewards familyId="family-1" authUid="child-1" />);
  act(() => mockList({ data: [reward], fromCache: true }));
  expect(screen.getByText('Earned — waiting for Parent')).toBeOnTheScreen();
  expect(screen.queryByText('Fulfilled — delivered')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Open reward: Cinema' }));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/rewards/[rewardId]',
    params: { rewardId: 'reward-1' },
  });
  act(() =>
    mockList({
      data: [
        {
          ...reward,
          status: 'FULFILLED',
          fulfilledAt: reward.earnedAt,
          fulfilledBy: 'parent-1',
        },
      ],
      fromCache: false,
    }),
  );
  expect(screen.getByText('Fulfilled — delivered')).toBeOnTheScreen();
  expect(screen.queryByText('Earned — waiting for Parent')).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Mark as fulfilled' }),
  ).toBeNull();
  expect(
    screen.getByText(
      `Fulfilled: ${new Date(reward.earnedAt).toLocaleString()}`,
    ),
  ).toBeOnTheScreen();
});
it('empty/error/cache state and scoped listener cleanup cannot retain another family Reward', () => {
  const view = render(<EarnedRewards familyId="family-1" authUid="child-1" />);
  act(() => mockList({ data: [], fromCache: false }));
  expect(screen.getByText('No earned rewards yet')).toBeOnTheScreen();
  const old = mockList;
  view.rerender(<EarnedRewards familyId="family-2" authUid="child-2" />);
  expect(mockStop).toHaveBeenCalled();
  act(() => old({ data: [reward], fromCache: false }));
  expect(screen.queryByText('Cinema')).toBeNull();
  act(() => mockFailure(new Error('denied')));
  expect(
    screen.getByText(
      'Your rewards could not be loaded. Reopen this screen to try again.',
    ),
  ).toBeOnTheScreen();
});
it('Child detail shows frozen terms/status/timestamps and never exposes Parent controls', () => {
  render(<RewardDetail rewardId="reward-1" authUid="child-1" />);
  act(() => mockReward({ data: reward, fromCache: false }));
  expect(screen.getByText('Choose a movie')).toBeOnTheScreen();
  expect(screen.queryAllByRole('button')).toHaveLength(0);
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
});
