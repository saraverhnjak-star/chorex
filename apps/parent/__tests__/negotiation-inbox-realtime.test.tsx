import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ParentNegotiationInbox } from '../src/offers/ParentNegotiationInbox';

jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: jest.fn() }),
}));

const mockAccept = jest.fn();
const mockCounter = jest.fn();
const mockReject = jest.fn();
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
  acceptOffer: (input: unknown) => mockAccept(input),
  counterOffer: (input: unknown) => mockCounter(input),
  rejectOffer: (input: unknown) => mockReject(input),
  isFamilyClientError: () => false,
  familyClientErrorCodes: {},
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
  expect(screen.getByText('Proposed by Mia')).toBeOnTheScreen();
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

it('requires confirmation, retains the retry key, and lets realtime remove the accepted item', async () => {
  mockAccept
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({});
  render(
    <ParentNegotiationInbox
      activeChildren={children}
      authUid="parent-1"
      familyId="family-1"
    />,
  );
  act(() => emitItems?.([item]));
  fireEvent.press(screen.getByRole('button', { name: 'Accept counteroffer' }));
  expect(mockAccept).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Cancel acceptance' }));
  expect(
    screen.queryByRole('button', { name: 'Confirm accept counteroffer' }),
  ).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Accept counteroffer' }));
  await act(async () =>
    fireEvent.press(
      screen.getByRole('button', { name: 'Confirm accept counteroffer' }),
    ),
  );
  expect(
    screen.getByText('This offer could not be accepted. Try again.'),
  ).toBeOnTheScreen();
  await act(async () =>
    fireEvent.press(
      screen.getByRole('button', { name: 'Confirm accept counteroffer' }),
    ),
  );
  expect(mockAccept.mock.calls[1][0]).toEqual(mockAccept.mock.calls[0][0]);
  expect(mockAccept).toHaveBeenLastCalledWith(
    expect.objectContaining({
      offerId: 'offer-1',
      currentRevisionId: 'revision-2',
    }),
  );
  expect(screen.getByText('Contract active')).toBeOnTheScreen();
  expect(screen.getByText('Proposed by Mia')).toBeOnTheScreen();
  act(() => emitItems?.([]));
  expect(screen.queryByText('Proposed by Mia')).toBeNull();
  expect(screen.getByText('Contract active')).toBeOnTheScreen();
});

it('reviews complete Parent terms before sending, retries safely, and follows realtime removal', async () => {
  mockCounter
    .mockReset()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({});
  render(
    <ParentNegotiationInbox
      activeChildren={children}
      authUid="parent-1"
      familyId="family-1"
    />,
  );
  act(() => emitItems?.([item]));
  fireEvent.press(screen.getByRole('button', { name: 'Counteroffer' }));
  expect(screen.getByLabelText('Task 1 title')).toHaveProp(
    'value',
    'Load the dishwasher',
  );
  fireEvent.changeText(screen.getByLabelText('Task 1 title'), 'Water plants');
  fireEvent.changeText(screen.getByLabelText('Task 1 target count'), '3');
  fireEvent.changeText(
    screen.getByLabelText('Task 1 description (optional)'),
    'All pots',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Add task' }));
  fireEvent.changeText(screen.getByLabelText('Task 2 title'), 'Set the table');
  fireEvent.changeText(screen.getByLabelText('Reward title'), 'Museum');
  fireEvent.press(screen.getByRole('button', { name: 'Select experience' }));
  fireEvent.changeText(
    screen.getByLabelText('Deadline date (YYYY-MM-DD)'),
    '2099-10-11',
  );
  fireEvent.changeText(
    screen.getByLabelText('Deadline time (local, HH:mm)'),
    '17:30',
  );
  fireEvent.changeText(
    screen.getByLabelText('Proposal note (optional)'),
    'New proposal',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Review counteroffer' }));
  expect(mockCounter).not.toHaveBeenCalled();
  expect(screen.getByText('Review your counteroffer')).toBeOnTheScreen();
  expect(screen.getByText('Water plants · 3×')).toBeOnTheScreen();
  expect(screen.getByText('Museum · EXPERIENCE')).toBeOnTheScreen();
  await act(async () =>
    fireEvent.press(screen.getByRole('button', { name: 'Send counteroffer' })),
  );
  expect(
    screen.getByText('This counteroffer could not be sent. Try again.'),
  ).toBeOnTheScreen();
  await act(async () =>
    fireEvent.press(screen.getByRole('button', { name: 'Send counteroffer' })),
  );
  expect(mockCounter.mock.calls[1][0]).toEqual(mockCounter.mock.calls[0][0]);
  const request = mockCounter.mock.calls[0][0];
  expect(request).toEqual(
    expect.objectContaining({
      offerId: 'offer-1',
      currentRevisionId: 'revision-2',
      tasks: [
        { title: 'Water plants', description: 'All pots', targetCount: 3 },
        { title: 'Set the table', targetCount: 1 },
      ],
      reward: { title: 'Museum', type: 'EXPERIENCE' },
      note: 'New proposal',
    }),
  );
  const localDeadline = new Date(request.deadlineAt);
  expect([
    localDeadline.getFullYear(),
    localDeadline.getMonth(),
    localDeadline.getDate(),
    localDeadline.getHours(),
    localDeadline.getMinutes(),
  ]).toEqual([2099, 9, 11, 17, 30]);
  expect(screen.getByText('Counteroffer sent')).toBeOnTheScreen();
  act(() => emitItems?.([]));
  expect(screen.queryByText('Proposed by Mia')).toBeNull();
  expect(screen.getByText('Counteroffer sent')).toBeOnTheScreen();
});

it('blocks invalid terms and discards an editor when the current revision changes', () => {
  mockCounter.mockReset();
  render(
    <ParentNegotiationInbox
      activeChildren={children}
      authUid="parent-1"
      familyId="family-1"
    />,
  );
  act(() => emitItems?.([item]));
  fireEvent.press(screen.getByRole('button', { name: 'Counteroffer' }));
  fireEvent.changeText(screen.getByLabelText('Task 1 target count'), '1.5');
  fireEvent.press(screen.getByRole('button', { name: 'Review counteroffer' }));
  expect(
    screen.getByText('Task target counts must be whole numbers.'),
  ).toBeOnTheScreen();
  expect(mockCounter).not.toHaveBeenCalled();
  act(() =>
    emitItems?.([
      {
        ...item,
        offer: { ...item.offer, currentRevisionId: 'revision-4' },
        revision: { ...item.revision, id: 'revision-4', revisionNumber: 4 },
      },
    ]),
  );
  expect(screen.queryByText('Edit counteroffer terms')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Counteroffer' }));
  expect(screen.getByLabelText('Task 1 target count')).toHaveProp('value', '2');
  fireEvent.press(screen.getByRole('button', { name: 'Cancel counteroffer' }));
  expect(screen.queryByText('Edit counteroffer terms')).toBeNull();
});

it('requires deliberate rejection, waits for backend success, and relies on realtime removal', async () => {
  mockReject.mockReset();
  let resolveRequest: (() => void) | undefined;
  mockReject.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        resolveRequest = resolve;
      }),
  );
  render(
    <ParentNegotiationInbox
      activeChildren={children}
      authUid="parent-1"
      familyId="family-1"
    />,
  );
  act(() => emitItems?.([item]));
  fireEvent.press(screen.getByRole('button', { name: 'Reject counteroffer' }));
  expect(mockReject).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Rejecting this counteroffer ends this Offer negotiation. The terms will remain in its history.',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Keep negotiating' }));
  expect(
    screen.queryByRole('button', { name: 'Confirm reject counteroffer' }),
  ).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Reject counteroffer' }));
  fireEvent.press(
    screen.getByRole('button', { name: 'Confirm reject counteroffer' }),
  );
  expect(mockReject).toHaveBeenCalledTimes(1);
  expect(mockReject).toHaveBeenCalledWith(
    expect.objectContaining({
      offerId: 'offer-1',
      currentRevisionId: 'revision-2',
    }),
  );
  expect(screen.queryByText('Counteroffer rejected')).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Confirm reject counteroffer' }),
  ).toBeDisabled();
  await act(async () => resolveRequest?.());
  expect(screen.getByText('Counteroffer rejected')).toBeOnTheScreen();
  expect(screen.getByText('Proposed by Mia')).toBeOnTheScreen();
  act(() => emitItems?.([]));
  expect(screen.queryByText('Proposed by Mia')).toBeNull();
  expect(screen.getByText('Counteroffer rejected')).toBeOnTheScreen();
});

it('retains the same rejection key after a failed request and invalidates stale confirmations', async () => {
  mockReject
    .mockReset()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({});
  render(
    <ParentNegotiationInbox
      activeChildren={children}
      authUid="parent-1"
      familyId="family-1"
    />,
  );
  act(() => emitItems?.([item]));
  fireEvent.press(screen.getByRole('button', { name: 'Reject counteroffer' }));
  await act(async () =>
    fireEvent.press(
      screen.getByRole('button', { name: 'Confirm reject counteroffer' }),
    ),
  );
  expect(
    screen.getByText('This offer could not be rejected. Try again.'),
  ).toBeOnTheScreen();
  expect(screen.queryByText('Counteroffer rejected')).toBeNull();
  await act(async () =>
    fireEvent.press(
      screen.getByRole('button', { name: 'Confirm reject counteroffer' }),
    ),
  );
  expect(mockReject.mock.calls[1][0]).toEqual(mockReject.mock.calls[0][0]);
  fireEvent.press(screen.getByRole('button', { name: 'Reject counteroffer' }));
  act(() =>
    emitItems?.([
      {
        ...item,
        offer: { ...item.offer, currentRevisionId: 'revision-4' },
        revision: { ...item.revision, id: 'revision-4', revisionNumber: 4 },
      },
    ]),
  );
  expect(
    screen.queryByRole('button', { name: 'Confirm reject counteroffer' }),
  ).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Reject counteroffer' }),
  ).toBeOnTheScreen();
  expect(mockReject).toHaveBeenCalledTimes(2);
});
