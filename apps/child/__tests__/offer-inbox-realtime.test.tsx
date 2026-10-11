import { setAppLanguage, t } from '@chorex/ui';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { OfferInbox } from '../src/offers/OfferInbox';

const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate }),
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
  subscribeToChildOfferHistory: (
    familyId: string,
    onItems: (items: readonly unknown[]) => void,
    onError: (error: unknown) => void,
  ) => mockSubscribe(familyId, onItems, onError),
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
    reward: { title: 'Cinema', type: 'EXPERIENCE', iconKey: 'cinema' as const },
    deadlineAt: '2026-10-10T18:00:00.000Z',
    createdAt: '2026-10-03T12:34:56.789Z',
  },
} as const;

it('applies realtime add, change, and remove events and cleans up subscriptions', () => {
  const view = render(<OfferInbox authUid="child-1" familyId="family-1" />);

  act(() => emitItems?.([]));
  expect(screen.getByText('No offers are waiting for you.')).toBeOnTheScreen();
  expect(screen.queryByRole('header', { name: 'Offers' })).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Refresh offers' }),
  ).not.toBeOnTheScreen();

  act(() => emitItems?.([item]));
  expect(screen.getByText('Reward: Cinema')).toBeOnTheScreen();

  act(() =>
    emitItems?.([
      {
        ...item,
        revision: {
          ...item.revision,
          reward: {
            title: 'Museum',
            type: 'EXPERIENCE',
            iconKey: 'cinema' as const,
          },
        },
      },
    ]),
  );
  expect(screen.getByText('Reward: Museum')).toBeOnTheScreen();
  expect(screen.queryByText('Reward: Cinema')).not.toBeOnTheScreen();

  act(() => emitItems?.([]));
  expect(screen.queryByText('Reward: Museum')).not.toBeOnTheScreen();

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

it('shows the Home offer card only while an offer is available', () => {
  const view = render(
    <OfferInbox preview authUid="child-1" familyId="family-1" />,
  );
  expect(view.toJSON()).toBeNull();
  act(() => emitItems?.([]));
  expect(view.toJSON()).toBeNull();
  act(() => emitItems?.([item]));
  expect(screen.getByText('NEW OFFER')).toBeOnTheScreen();
  expect(screen.getByText('Load the dishwasher')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'View offer' })).toBeOnTheScreen();
  expect(
    screen.getByRole('button', { name: 'Suggest a change' }),
  ).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Suggest a change' }));
  expect(mockNavigate).toHaveBeenLastCalledWith({
    pathname: '/offers/[offerId]',
    params: { offerId: 'offer-1', counterOfferId: 'offer-1' },
  });
  act(() => emitItems?.([]));
  expect(view.toJSON()).toBeNull();
});

it('opens the selected counteroffer form after the Offers subscription loads', () => {
  render(
    <OfferInbox
      authUid="child-1"
      familyId="family-1"
      offerId="offer-1"
      initialCounterOfferId="offer-1"
    />,
  );
  act(() => emitItems?.([item]));
  expect(
    screen.getByRole('button', { name: 'Send counteroffer' }),
  ).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Cancel counteroffer' }));
  act(() => emitItems?.([item]));
  expect(
    screen.queryByRole('button', { name: 'Send counteroffer' }),
  ).toBeNull();
});

it('lists all offers and navigates to the selected offer without exposing mutation controls', () => {
  render(<OfferInbox authUid="child-1" familyId="family-1" />);
  const second = {
    ...item,
    offer: { ...item.offer, id: 'offer-2' },
    revision: {
      ...item.revision,
      reward: { ...item.revision.reward, title: 'Museum' },
    },
  };
  act(() => emitItems?.([item, second]));
  expect(
    screen.getByRole('button', { name: 'Open offer: Cinema' }),
  ).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Open offer: Museum' }));
  expect(mockNavigate).toHaveBeenLastCalledWith({
    pathname: '/offers/[offerId]',
    params: { offerId: 'offer-2' },
  });
  expect(screen.queryByRole('button', { name: 'Accept offer' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Counter reward' })).toBeNull();
});

it('shows only the requested offer and removes actions when it leaves the inbox', () => {
  render(
    <OfferInbox offerId="offer-1" authUid="child-1" familyId="family-1" />,
  );
  const other = {
    ...item,
    offer: { ...item.offer, id: 'offer-2' },
    revision: {
      ...item.revision,
      reward: { ...item.revision.reward, title: 'Museum' },
    },
  };
  act(() => emitItems?.([item, other]));
  expect(screen.getByRole('header', { name: 'Cinema' })).toBeOnTheScreen();
  expect(screen.getByText('2×')).toBeOnTheScreen();
  expect(screen.getByText('Agreed number of repetitions')).toBeOnTheScreen();
  expect(screen.queryByRole('header', { name: 'Tasks' })).toBeNull();
  expect(screen.queryByRole('header', { name: 'Deadline' })).toBeNull();
  act(() =>
    emitItems?.([
      {
        ...item,
        revision: {
          ...item.revision,
          tasks: [{ title: 'One task', targetCount: 1 }],
        },
      },
      other,
    ]),
  );
  expect(screen.queryByText('1×')).toBeNull();
  expect(screen.queryByText('Agreed number of repetitions')).toBeNull();

  expect(screen.queryByText('Museum · EXPERIENCE')).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Accept offer' }),
  ).toBeOnTheScreen();
  act(() => emitItems?.([other]));
  expect(screen.getByText('Offer unavailable')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Accept offer' })).toBeNull();
  fireEvent.press(screen.getByRole('link', { name: 'Back to Offers' }));
  expect(mockNavigate).toHaveBeenLastCalledWith('/offers');
});

it('filters the two status tabs and keeps parent-turn details read-only', () => {
  const view = render(<OfferInbox authUid="child-1" familyId="family-1" />);
  const parentTurn = {
    ...item,
    offer: { ...item.offer, id: 'waiting', status: 'AWAITING_PARENT' },
    revision: {
      ...item.revision,
      reward: { ...item.revision.reward, title: 'Waiting reward' },
    },
  };
  const closed = {
    ...item,
    offer: { ...item.offer, id: 'closed', status: 'ACCEPTED' },
    revision: {
      ...item.revision,
      reward: { ...item.revision.reward, title: 'Closed reward' },
    },
  };
  act(() => emitItems?.([item, parentTurn, closed]));
  expect(
    screen.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel),
  ).toEqual(['Your turn', "Parent's turn"]);
  expect(screen.queryByText('Reward: Waiting reward')).toBeNull();
  fireEvent.press(screen.getByRole('tab', { name: "Parent's turn" }));
  expect(screen.getByText('Reward: Waiting reward')).toBeOnTheScreen();
  expect(screen.queryByText('Reward: Closed reward')).toBeNull();
  expect(screen.queryByRole('tab', { name: 'Closed' })).toBeNull();
  view.rerender(
    <OfferInbox authUid="child-1" familyId="family-1" offerId="waiting" />,
  );
  act(() => emitItems?.([parentTurn]));
  expect(screen.getByText("Parent's turn")).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Accept offer' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Counter reward' })).toBeNull();
});

it('updates translated tab labels without changing filtering or user-authored reward titles', () => {
  const view = render(<OfferInbox authUid="child-1" familyId="family-1" />);
  const parentTurn = {
    ...item,
    offer: { ...item.offer, id: 'waiting', status: 'AWAITING_PARENT' },
    revision: {
      ...item.revision,
      reward: { ...item.revision.reward, title: 'Waiting reward' },
    },
  };
  act(() => emitItems?.([item, parentTurn]));
  try {
    act(() => setAppLanguage('sl'));
    expect(screen.getByText('Nagrada: Cinema')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('tab', { name: t("Parent's turn") }));
    expect(screen.getByText('Nagrada: Waiting reward')).toBeOnTheScreen();
    expect(screen.queryByText('Nagrada: Cinema')).toBeNull();
    act(() => setAppLanguage('de'));
    expect(screen.getByText('Belohnung: Waiting reward')).toBeOnTheScreen();
    expect(
      screen.getByRole('tab', { name: t("Parent's turn") }).props
        .accessibilityState.selected,
    ).toBe(true);
    act(() => setAppLanguage('hr'));
    expect(screen.getByText('Nagrada: Waiting reward')).toBeOnTheScreen();
  } finally {
    view.unmount();
    act(() => setAppLanguage('en'));
  }
});
