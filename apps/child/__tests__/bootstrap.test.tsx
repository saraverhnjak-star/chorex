import { useState as mockUseState } from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import HomeScreen from '../app/index';
import { ChildSessionProvider } from '../src/auth/session';

let mockAuthUser: { uid: string; email: null } | null = null;
let mockAuthListener: ((user: typeof mockAuthUser) => void) | undefined;
const mockRedeemPairingSession = jest.fn().mockResolvedValue({
  customToken: 'firebase-custom-token',
});
const mockSignInWithChildCustomToken = jest
  .fn()
  .mockImplementation(async () => {
    mockAuthUser = { uid: 'child-test-uid', email: null };
    mockAuthListener?.(mockAuthUser);
    return mockAuthUser;
  });
const mockReadCurrentChildFamily = jest.fn().mockResolvedValue({
  profile: {
    uid: 'child-test-uid',
    displayName: 'Mia',
    accountType: 'CHILD',
    createdAt: '2026-10-03T12:34:56.789Z',
  },
  family: {
    id: 'family-test-id',
    name: 'Rivera Family',
    createdBy: 'parent-test-uid',
    createdAt: '2026-10-03T12:34:56.789Z',
    updatedAt: '2026-10-03T12:34:56.789Z',
  },
  membership: {
    uid: 'child-test-uid',
    familyId: 'family-test-id',
    role: 'CHILD',
    displayName: 'Mia',
    status: 'ACTIVE',
    joinedAt: '2026-10-03T12:34:56.789Z',
  },
});
const childOfferInboxItems = [
  {
    offer: {
      id: 'offer-test-id',
      familyId: 'family-test-id',
      parentUid: 'parent-test-uid',
      childUid: 'child-test-uid',
      status: 'AWAITING_CHILD',
      currentRevisionId: 'revision-test-id',
      createdAt: '2026-10-03T12:34:56.789Z',
      updatedAt: '2026-10-03T12:35:56.789Z',
    },
    revision: {
      id: 'revision-test-id',
      offerId: 'offer-test-id',
      revisionNumber: 1,
      proposedByUid: 'parent-test-uid',
      proposedByRole: 'PARENT',
      tasks: [{ title: 'Load the dishwasher', targetCount: 2 }],
      reward: {
        title: 'Cinema',
        description: 'Choose a movie',
        type: 'EXPERIENCE',
      },
      deadlineAt: '2026-10-10T18:00:00.000Z',
      createdAt: '2026-10-03T12:34:56.789Z',
    },
  },
];
const mockChildOfferUnsubscribe = jest.fn();
const mockSubscribeToCurrentChildOfferInbox = jest.fn(
  (
    _familyId: string,
    onItems: (items: typeof childOfferInboxItems) => void,
    _onError: (error: unknown) => void,
  ) => {
    onItems(childOfferInboxItems);
    return mockChildOfferUnsubscribe;
  },
);
const mockAcceptOffer = jest.fn().mockResolvedValue({
  offer: {
    id: 'offer-test-id',
    familyId: 'family-test-id',
    parentUid: 'parent-test-uid',
    childUid: 'child-test-uid',
    status: 'ACCEPTED',
    currentRevisionId: 'revision-test-id',
    createdAt: '2026-10-03T12:34:56.789Z',
    updatedAt: '2026-10-03T12:36:56.789Z',
  },
  contract: {
    id: 'contract-test-id',
    familyId: 'family-test-id',
    parentUid: 'parent-test-uid',
    childUid: 'child-test-uid',
    source: {
      type: 'OFFER',
      offerId: 'offer-test-id',
      revisionId: 'revision-test-id',
    },
    rewardTerms: { title: 'Cinema', type: 'EXPERIENCE' },
    deadlineAt: '2026-10-10T18:00:00.000Z',
    status: 'ACTIVE',
    reviewCycle: 0,
    createdAt: '2026-10-03T12:36:56.789Z',
    updatedAt: '2026-10-03T12:36:56.789Z',
  },
  tasks: [],
});
const mockRejectOffer = jest.fn().mockResolvedValue({
  offer: {
    id: 'offer-test-id',
    familyId: 'family-test-id',
    parentUid: 'parent-test-uid',
    childUid: 'child-test-uid',
    status: 'REJECTED',
    currentRevisionId: 'revision-test-id',
    createdAt: '2026-10-03T12:34:56.789Z',
    updatedAt: '2026-10-03T12:36:56.789Z',
  },
});
const mockCounterOffer = jest.fn().mockResolvedValue({
  offer: {
    id: 'offer-test-id',
    familyId: 'family-test-id',
    parentUid: 'parent-test-uid',
    childUid: 'child-test-uid',
    status: 'AWAITING_PARENT',
    currentRevisionId: 'revision-counter-id',
    createdAt: '2026-10-03T12:34:56.789Z',
    updatedAt: '2026-10-03T12:36:56.789Z',
  },
  revision: {
    id: 'revision-counter-id',
    offerId: 'offer-test-id',
    revisionNumber: 2,
    proposedByUid: 'child-test-uid',
    proposedByRole: 'CHILD',
    tasks: [{ title: 'Load the dishwasher', targetCount: 2 }],
    reward: {
      title: 'One hour of games',
      description: 'After dinner',
      type: 'PRIVILEGE',
    },
    deadlineAt: '2026-10-10T18:00:00.000Z',
    note: 'This feels fair.',
    createdAt: '2026-10-03T12:36:56.789Z',
  },
});
const mockRegisterCurrentDevice = jest
  .fn()
  .mockResolvedValue({ status: 'registered' });
const mockRemoveCurrentDeviceRegistration = jest
  .fn()
  .mockResolvedValue(undefined);

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

jest.mock('@chorex/firebase-client', () => ({
  useContractDetail: () => ({ status: 'loading' }),
  useReminderPreference: () => ({
    state: { enabled: true, busy: false },
    save: jest.fn(),
  }),
  useEarnedRewards: () => ({ status: 'ready', rewards: [], fromCache: false }),
  useActiveContracts: () => ({
    status: 'ready',
    contracts: [],
    fromCache: false,
  }),
  acceptOffer: (...args: unknown[]) => mockAcceptOffer(...args),
  counterOffer: (...args: unknown[]) => mockCounterOffer(...args),
  observeAuthState: jest.fn((listener) => {
    mockAuthListener = listener;
    listener(mockAuthUser);
    return jest.fn();
  }),
  redeemPairingSession: (...args: unknown[]) =>
    mockRedeemPairingSession(...args),
  readCurrentChildFamily: (...args: unknown[]) =>
    mockReadCurrentChildFamily(...args),
  rejectOffer: (...args: unknown[]) => mockRejectOffer(...args),
  signInWithChildCustomToken: (...args: unknown[]) =>
    mockSignInWithChildCustomToken(...args),
  signOutCurrentUser: jest.fn(),
  subscribeToCurrentChildOfferInbox: (
    familyId: string,
    onItems: (items: typeof childOfferInboxItems) => void,
    onError: (error: unknown) => void,
  ) => mockSubscribeToCurrentChildOfferInbox(familyId, onItems, onError),
}));

jest.mock('@chorex/notifications', () => ({
  useNotificationEducation: () => {
    const [showEducation, setShowEducation] = mockUseState(true);
    return {
      showEducation,
      skip: () => setShowEducation(false),
      revisit: () => setShowEducation(true),
    };
  },
  useDeviceRegistrationLifecycle: (variant: string) => {
    const [state, setState] = mockUseState({
      status: 'off',
      permission: { status: 'undetermined', granted: false },
    });
    return {
      state,
      enable: async () => {
        await mockRegisterCurrentDevice(variant);
        setState({
          status: 'registered',
          permission: { status: 'granted', granted: true },
        });
      },
    };
  },
  registerCurrentDevice: (...args: unknown[]) =>
    mockRegisterCurrentDevice(...args),
  removeCurrentDeviceRegistration: (...args: unknown[]) =>
    mockRemoveCurrentDeviceRegistration(...args),
}));

jest.mock('../src/pairing/messages', () => ({
  getPairingErrorMessage: () => 'Pairing could not be completed.',
}));

jest.mock('../src/notifications/messages', () => ({
  getNotificationErrorMessage: () => 'Notifications could not be enabled.',
}));

it('pairs, loads the Child home, and restores it after restart', async () => {
  mockAuthUser = null;
  const firstLaunch = render(
    <ChildSessionProvider>
      <HomeScreen />
    </ChildSessionProvider>,
  );
  expect(
    await screen.findByRole('header', { name: 'Pair this device' }),
  ).toBeOnTheScreen();
  fireEvent.changeText(
    screen.getByLabelText('Pairing token'),
    'AbCdEfGhIjKlMnOpQrStUw',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Pair device' }));
  expect(await screen.findByText('Hi, Mia!')).toBeOnTheScreen();
  expect(screen.getByText('Hi, Mia!')).toBeOnTheScreen();
  expect(await screen.findByText('Load the dishwasher · 2×')).toBeOnTheScreen();
  expect(screen.getByText('Cinema · EXPERIENCE')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Accept offer' }));
  expect(await screen.findByText('Contract is active.')).toBeOnTheScreen();
  expect(screen.queryByText('Load the dishwasher · 2×')).not.toBeOnTheScreen();
  expect(mockAcceptOffer).toHaveBeenCalledWith({
    offerId: 'offer-test-id',
    currentRevisionId: 'revision-test-id',
    idempotencyKey: expect.stringMatching(/^accept-/),
  });
  expect(mockRegisterCurrentDevice).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
  expect(
    screen.getByText(
      'Notifications are off. You can keep using ChoreX normally.',
    ),
  ).toBeOnTheScreen();
  expect(mockRegisterCurrentDevice).not.toHaveBeenCalled();
  // Explicit entry shows the explanation again before requesting the OS prompt.
  fireEvent.press(screen.getByRole('button', { name: 'Enable notifications' }));
  expect(screen.getByRole('button', { name: 'Not now' })).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Enable notifications' }));
  expect(mockRegisterCurrentDevice).toHaveBeenCalledWith('CHILD');
  expect(mockRedeemPairingSession).toHaveBeenCalledWith(
    expect.objectContaining({ token: 'AbCdEfGhIjKlMnOpQrStUw' }),
  );
  expect(mockSignInWithChildCustomToken).toHaveBeenCalledWith(
    'firebase-custom-token',
  );

  firstLaunch.unmount();
  const secondLaunch = render(
    <ChildSessionProvider>
      <HomeScreen />
    </ChildSessionProvider>,
  );
  await waitFor(() => expect(screen.getByText('Hi, Mia!')).toBeOnTheScreen());
  expect(screen.getByText('Hi, Mia!')).toBeOnTheScreen();
  expect(await screen.findByText('Load the dishwasher · 2×')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Reject offer' }));
  expect(screen.getByText('Reject this offer?')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Keep offer' }));
  expect(screen.queryByText('Reject this offer?')).not.toBeOnTheScreen();
  expect(screen.getByText('Load the dishwasher · 2×')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Reject offer' }));
  fireEvent.press(screen.getByRole('button', { name: 'Confirm rejection' }));
  expect(await screen.findByText('Offer rejected.')).toBeOnTheScreen();
  expect(screen.queryByText('Load the dishwasher · 2×')).not.toBeOnTheScreen();
  expect(mockRejectOffer).toHaveBeenCalledWith({
    offerId: 'offer-test-id',
    currentRevisionId: 'revision-test-id',
    idempotencyKey: expect.stringMatching(/^reject-/),
  });

  secondLaunch.unmount();
  render(
    <ChildSessionProvider>
      <HomeScreen />
    </ChildSessionProvider>,
  );
  expect(await screen.findByText('Load the dishwasher · 2×')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Counter reward' }));
  expect(
    screen.getByRole('header', { name: 'Make a counteroffer' }),
  ).toBeOnTheScreen();
  fireEvent.changeText(
    screen.getByLabelText('Counteroffer reward title'),
    'One hour of games',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Select privilege' }));
  fireEvent.changeText(
    screen.getByLabelText('Counteroffer reward description (optional)'),
    'After dinner',
  );
  fireEvent.changeText(
    screen.getByLabelText('Counteroffer note (optional)'),
    'This feels fair.',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Send counteroffer' }));
  expect(await screen.findByText('Waiting for parent')).toBeOnTheScreen();
  expect(screen.queryByText('Load the dishwasher · 2×')).not.toBeOnTheScreen();
  expect(mockCounterOffer).toHaveBeenCalledWith({
    offerId: 'offer-test-id',
    currentRevisionId: 'revision-test-id',
    reward: {
      title: 'One hour of games',
      type: 'PRIVILEGE',
      description: 'After dinner',
    },
    note: 'This feels fair.',
    idempotencyKey: expect.stringMatching(/^counter-/),
  });
  expect(mockReadCurrentChildFamily).toHaveBeenCalledTimes(3);
  expect(mockSubscribeToCurrentChildOfferInbox).toHaveBeenCalledWith(
    'family-test-id',
    expect.any(Function),
    expect.any(Function),
  );
  expect(mockChildOfferUnsubscribe).toHaveBeenCalledTimes(2);
});
