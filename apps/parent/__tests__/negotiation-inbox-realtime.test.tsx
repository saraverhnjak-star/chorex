import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ParentNegotiationInbox } from '../src/offers/ParentNegotiationInbox';

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
  isOfferInboxClientError: () => false,
  offerInboxClientErrorCodes: {},
  subscribeToCurrentParentNegotiationInbox: (
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
    status: 'AWAITING_PARENT',
    currentRevisionId: 'revision-2',
    createdAt: '2026-10-03T12:34:56.789Z',
    updatedAt: '2026-10-03T12:35:56.789Z',
  },
  revision: {
    id: 'revision-2',
    offerId: 'offer-1',
    revisionNumber: 2,
    proposedByUid: 'child-1',
    proposedByRole: 'CHILD',
    tasks: [{ title: 'Load the dishwasher', targetCount: 2 }],
    reward: { title: 'One hour of games', type: 'PRIVILEGE' },
    deadlineAt: '2026-10-10T18:00:00.000Z',
    note: 'This feels fair.',
    createdAt: '2026-10-03T12:35:56.789Z',
  },
} as const;

const children = [
  {
    uid: 'child-1',
    familyId: 'family-1',
    role: 'CHILD' as const,
    displayName: 'Mia',
    status: 'ACTIVE' as const,
    joinedAt: '2026-10-03T12:34:56.789Z',
  },
];

it('renders realtime Parent counteroffer changes and cleans up subscriptions', () => {
  const view = render(
    <ParentNegotiationInbox
      activeChildren={children}
      authUid="parent-1"
      familyId="family-1"
    />,
  );

  act(() => emitItems?.([]));
  expect(
    screen.getByText('No counteroffers are waiting for you.'),
  ).toBeOnTheScreen();

  act(() => emitItems?.([item]));
  expect(screen.getByText('Mia')).toBeOnTheScreen();
  expect(screen.getByText('One hour of games · PRIVILEGE')).toBeOnTheScreen();
  expect(screen.getByText('This feels fair.')).toBeOnTheScreen();
  expect(screen.getByText('Load the dishwasher · 2×')).toBeOnTheScreen();

  act(() =>
    emitItems?.([
      {
        ...item,
        revision: {
          ...item.revision,
          reward: { title: 'Museum', type: 'EXPERIENCE' },
          note: undefined,
        },
      },
    ]),
  );
  expect(screen.getByText('Museum · EXPERIENCE')).toBeOnTheScreen();
  expect(screen.queryByText('This feels fair.')).not.toBeOnTheScreen();

  act(() => emitItems?.([]));
  expect(screen.queryByText('Museum · EXPERIENCE')).not.toBeOnTheScreen();

  view.rerender(
    <ParentNegotiationInbox
      activeChildren={children}
      authUid="parent-2"
      familyId="family-2"
    />,
  );
  expect(mockSubscribe).toHaveBeenLastCalledWith(
    'family-2',
    expect.any(Function),
    expect.any(Function),
  );
  expect(mockUnsubscribe).toHaveBeenCalledTimes(1);

  act(() => emitError?.(new Error('subscription failed')));
  expect(
    screen.getByText('Counteroffers could not be loaded. Try again.'),
  ).toBeOnTheScreen();
  fireEvent.press(
    screen.getByRole('button', { name: 'Try counteroffers again' }),
  );
  expect(mockSubscribe).toHaveBeenCalledTimes(3);
  expect(mockUnsubscribe).toHaveBeenCalledTimes(2);

  view.unmount();
  expect(mockUnsubscribe).toHaveBeenCalledTimes(3);
});
