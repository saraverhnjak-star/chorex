import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { OfferInbox } from '../src/offers/OfferInbox';

jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: jest.fn() }),
}));

const mockUnsubscribe = jest.fn();
let emitItems: ((items: readonly unknown[]) => void) | undefined;
let emitError: ((error: unknown) => void) | undefined;
const mockSubscribe = jest.fn(
  (
    _familyId: string,
    onItems: (items: readonly unknown[]) => void,
    onError: (error: unknown) => void,
  ) => {
    emitItems = onItems;
    emitError = onError;
    return mockUnsubscribe;
  },
);

jest.mock('@chorex/firebase-client', () => ({
  acceptOffer: jest.fn(),
  counterOffer: jest.fn(),
  familyClientErrorCodes: {},
  isFamilyClientError: () => false,
  isOfferInboxClientError: () => false,
  offerInboxClientErrorCodes: {},
  rejectOffer: jest.fn(),
  subscribeToCurrentChildOfferInbox: (
    familyId: string,
    onItems: (items: readonly unknown[]) => void,
    onError: (error: unknown) => void,
  ) => mockSubscribe(familyId, onItems, onError),
}));

const item = {
  offer: {
    id: 'offer-1',
    familyId: 'family-1',
    parentUid: 'parent-1',
    childUid: 'child-1',
    status: 'AWAITING_CHILD',
    currentRevisionId: 'revision-1',
    createdAt: '2026-10-03T12:34:56.789Z',
    updatedAt: '2026-10-03T12:35:56.789Z',
  },
  revision: {
    id: 'revision-1',
    offerId: 'offer-1',
    revisionNumber: 1,
    proposedByUid: 'parent-1',
    proposedByRole: 'PARENT',
    tasks: [{ title: 'Load the dishwasher', targetCount: 2 }],
    reward: { title: 'Cinema', type: 'EXPERIENCE' },
    deadlineAt: '2026-10-10T18:00:00.000Z',
    createdAt: '2026-10-03T12:34:56.789Z',
  },
} as const;

it('applies realtime add, change, and remove events and cleans up subscriptions', () => {
  const view = render(<OfferInbox authUid="child-1" familyId="family-1" />);

  act(() => emitItems?.([]));
  expect(screen.getByText('No offers are waiting for you.')).toBeOnTheScreen();
  expect(
    screen.queryByRole('button', { name: 'Refresh offers' }),
  ).not.toBeOnTheScreen();

  act(() => emitItems?.([item]));
  expect(screen.getByText('Cinema · EXPERIENCE')).toBeOnTheScreen();

  act(() =>
    emitItems?.([
      {
        ...item,
        revision: {
          ...item.revision,
          reward: { title: 'Museum', type: 'EXPERIENCE' },
        },
      },
    ]),
  );
  expect(screen.getByText('Museum · EXPERIENCE')).toBeOnTheScreen();
  expect(screen.queryByText('Cinema · EXPERIENCE')).not.toBeOnTheScreen();

  act(() => emitItems?.([]));
  expect(screen.queryByText('Museum · EXPERIENCE')).not.toBeOnTheScreen();

  view.rerender(<OfferInbox authUid="child-2" familyId="family-2" />);
  expect(mockSubscribe).toHaveBeenLastCalledWith(
    'family-2',
    expect.any(Function),
    expect.any(Function),
  );
  expect(mockUnsubscribe).toHaveBeenCalledTimes(1);

  act(() => emitError?.(new Error('subscription failed')));
  expect(
    screen.getByText('Your offers could not be loaded. Try again.'),
  ).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Try offers again' }));
  expect(mockSubscribe).toHaveBeenCalledTimes(3);
  expect(mockUnsubscribe).toHaveBeenCalledTimes(2);

  view.unmount();
  expect(mockUnsubscribe).toHaveBeenCalledTimes(3);
});
