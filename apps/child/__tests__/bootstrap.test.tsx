import { useState as mockUseState, useEffect as mockUseEffect } from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { ChildSurface as HomeScreen } from '../src/navigation/ChildSurface';
import { AppNavigation } from '../src/navigation/AppNavigation';
import { ChildSessionProvider } from '../src/auth/session';
import { clearAccountSession } from '@chorex/firebase-client';

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
        iconKey: 'plant' as const,
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
    rewardTerms: {
      title: 'Cinema',
      type: 'EXPERIENCE',
      iconKey: 'cinema' as const,
    },
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
      title: 'Screen time',
      description: 'After dinner',
      type: 'PRIVILEGE',
      iconKey: 'screen-time' as const,
    },
    deadlineAt: '2026-10-10T18:00:00.000Z',
    note: 'This feels fair.',
    createdAt: '2026-10-03T12:36:56.789Z',
  },
});
const mockSaveReminder = jest.fn();
const mockRegisterCurrentDevice = jest
  .fn()
  .mockResolvedValue({ status: 'registered' });
const mockRemoveCurrentDeviceRegistration = jest
  .fn()
  .mockResolvedValue(undefined);

const mockNavigate = jest.fn();
let mockPath = '/';
jest.mock('expo-router', () => ({
  Redirect: () => null,
  usePathname: () => mockPath,
  useFocusEffect: (effect: () => void) => mockUseEffect(effect, [effect]),
  useRouter: () => ({ push: mockNavigate, navigate: mockNavigate }),
}));

jest.mock('@chorex/firebase-client', () => ({
  observeAccountDeletion: () => () => {},
  clearAccountSession: jest.fn(async () => undefined),
  useContractDetail: () => ({ status: 'loading' }),
  useReminderPreference: () => ({
    state: { enabled: true, busy: false },
    save: mockSaveReminder,
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
  abandonDeletedAccountNotifications: async () => {},
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
      <AppNavigation>
        <HomeScreen />
      </AppNavigation>
    </ChildSessionProvider>,
  );
  expect(
    await screen.findByRole('header', { name: 'Connect to your family' }),
  ).toBeOnTheScreen();
  fireEvent.changeText(
    screen.getByLabelText('Pairing code'),
    'AbCdEfGhIjKlMnOpQrStUw',
  );
  mockRedeemPairingSession.mockRejectedValueOnce(new Error('network failure'));
  fireEvent.press(screen.getByRole('button', { name: 'Connect' }));
  expect(
    await screen.findByText('Pairing could not be completed.'),
  ).toBeOnTheScreen();
  expect(mockSignInWithChildCustomToken).not.toHaveBeenCalled();
  expect(mockAuthUser).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Connect' }));
  await screen.findByRole('button', { name: 'Notification settings' });
  expect(screen.queryByText('Hi, Mia!')).toBeNull();
  expect(screen.queryByText('Dogovorjeno število ponovitev')).toBeNull();
  for (const [label, route] of [
    ['My chores', '/contracts'],
    ['Offers', '/offers'],
    ['Rewards', '/rewards'],
    ['Notification settings', '/more'],
    ['Home', '/'],
    ['See all My chores', '/contracts'],
    ['See all Rewards', '/rewards'],
  ]) {
    fireEvent.press(
      screen.queryByRole('tab', { name: label }) ??
        screen.getByRole('button', { name: new RegExp('^' + label) }),
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenLastCalledWith(route));
    mockPath = route;
    firstLaunch.rerender(
      <ChildSessionProvider>
        <AppNavigation>
          <HomeScreen />
        </AppNavigation>
      </ChildSessionProvider>,
    );
    await waitFor(() =>
      expect(screen.queryByTestId('navigation-loader')).toBeNull(),
    );
  }
  fireEvent.press(screen.getByRole('button', { name: 'View offer' }));
  await waitFor(() =>
    expect(mockNavigate).toHaveBeenLastCalledWith({
      pathname: '/offers/[offerId]',
      params: { offerId: 'offer-test-id' },
    }),
  );
  mockPath = '/contracts/contract-1';
  firstLaunch.rerender(
    <ChildSessionProvider>
      <AppNavigation>
        <HomeScreen area="offers" offerId="offer-test-id" />
      </AppNavigation>
    </ChildSessionProvider>,
  );
  expect(screen.getByRole('tab', { name: 'My chores' })).toBeSelected();
  expect(await screen.findByText('Load the dishwasher')).toBeOnTheScreen();
  expect(screen.getByRole('header', { name: 'Cinema' })).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Accept offer' }));
  expect(await screen.findByText('Contract is active.')).toBeOnTheScreen();
  expect(screen.queryByText('Load the dishwasher')).not.toBeOnTheScreen();
  expect(mockAcceptOffer).toHaveBeenCalledWith({
    offerId: 'offer-test-id',
    currentRevisionId: 'revision-test-id',
    idempotencyKey: expect.stringMatching(/^accept-/),
  });
  expect(mockRegisterCurrentDevice).not.toHaveBeenCalled();
  firstLaunch.rerender(
    <ChildSessionProvider>
      <AppNavigation>
        <HomeScreen area="more" />
      </AppNavigation>
    </ChildSessionProvider>,
  );
  await screen.findByRole('header', { name: 'Settings' });
  const reminderSwitch = screen.getByRole('switch', {
    name: 'Deadline reminders',
  });
  expect(reminderSwitch.props.value).toBe(true);
  fireEvent(reminderSwitch, 'valueChange', false);
  expect(mockSaveReminder).toHaveBeenCalledWith(false);
  expect(mockRegisterCurrentDevice).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
  expect(
    screen.getByText('Notifications are currently disabled on this device.'),
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

  fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  await waitFor(() => expect(clearAccountSession).toHaveBeenCalledTimes(1));
  expect(mockRemoveCurrentDeviceRegistration).toHaveBeenCalledTimes(1);
  firstLaunch.unmount();
  const secondLaunch = render(
    <ChildSessionProvider>
      <HomeScreen area="offers" offerId="offer-test-id" />
    </ChildSessionProvider>,
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Notification settings' }),
    ).toBeOnTheScreen(),
  );
  expect(await screen.findByText('Load the dishwasher')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Reject offer' }));
  expect(screen.getByText('Reject this offer?')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Keep offer' }));
  expect(screen.queryByText('Reject this offer?')).not.toBeOnTheScreen();
  expect(screen.getByText('Load the dishwasher')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Reject offer' }));
  fireEvent.press(screen.getByRole('button', { name: 'Confirm rejection' }));
  expect(await screen.findByText('Offer rejected.')).toBeOnTheScreen();
  expect(screen.queryByText('Load the dishwasher')).not.toBeOnTheScreen();
  expect(mockRejectOffer).toHaveBeenCalledWith({
    offerId: 'offer-test-id',
    currentRevisionId: 'revision-test-id',
    idempotencyKey: expect.stringMatching(/^reject-/),
  });

  secondLaunch.unmount();
  render(
    <ChildSessionProvider>
      <HomeScreen area="offers" offerId="offer-test-id" />
    </ChildSessionProvider>,
  );
  expect(await screen.findByText('Load the dishwasher')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Counter reward' }));
  expect(
    screen.getByRole('header', { name: 'Make a counteroffer' }),
  ).toBeOnTheScreen();
  fireEvent.changeText(
    screen.getByLabelText('Selected reward'),
    'One hour of games',
  );
  expect(screen.getByLabelText('Selected reward')).toHaveProp(
    'value',
    'One hour of games',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Change' }));
  expect(
    screen.getByRole('button', {
      name: 'Choose Custom reward',
      selected: true,
    }),
  ).toBeOnTheScreen();
  fireEvent.press(
    screen.getByRole('button', { name: 'Choose Screen time reward' }),
  );
  expect(screen.queryByLabelText('Selected reward')).toBeNull();
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
  expect(screen.queryByText('Load the dishwasher')).not.toBeOnTheScreen();
  expect(mockCounterOffer).toHaveBeenCalledWith({
    offerId: 'offer-test-id',
    currentRevisionId: 'revision-test-id',
    reward: {
      title: 'Screen time',
      type: 'PRIVILEGE',
      iconKey: 'screen-time' as const,
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
  // Home-to-detail navigation replaces the scoped offer subscription.
  expect(mockChildOfferUnsubscribe).toHaveBeenCalledTimes(3);
});
