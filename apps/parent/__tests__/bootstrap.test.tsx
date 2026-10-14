import type { Contract, EarnedReward } from '@chorex/domain';
import { HomeAttention } from '../src/navigation/HomeAttention';
import { useDeviceRegistrationLifecycle as mockUseDeviceRegistrationLifecycle } from '@chorex/notifications';
import { useState as mockUseState, useEffect as mockUseEffect } from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import {
  createPairingSession,
  createFamily,
  createChild,
  readCurrentParentFamily,
} from '@chorex/firebase-client';
import HomeScreen from '../app/(app)/index';
import { ParentSurface } from '../src/navigation/ParentSurface';
import { PairDeviceScreen } from '../src/family/PairDeviceScreen';
import { AppNavigation } from '../src/navigation/AppNavigation';
import { OfferDraftComposer } from '../src/offers/OfferDraftComposer';

let mockAttentionReviews: readonly Contract[] = [];
let mockAttentionRewards: readonly EarnedReward[] = [];
const mockSaveReminder = jest.fn();
const mockSignOut = jest.fn().mockResolvedValue(undefined);
const mockRegisterCurrentDevice = jest
  .fn()
  .mockResolvedValue({ status: 'registered' });
const offerDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const mockCreateOfferDraft = jest.fn().mockResolvedValue({
  offer: {
    id: 'offer-test-id',
    familyId: 'family-test-id',
    parentUid: 'parent-test-uid',
    childUid: 'child-test-uid',
    status: 'DRAFT',
    currentRevisionId: 'revision-test-id',
    createdAt: '2026-10-03T12:34:56.789Z',
    updatedAt: '2026-10-03T12:34:56.789Z',
  },
  revision: {
    id: 'revision-test-id',
    offerId: 'offer-test-id',
    revisionNumber: 1,
    proposedByUid: 'parent-test-uid',
    proposedByRole: 'PARENT',
    tasks: [{ title: 'Load the dishwasher', targetCount: 1 }],
    reward: { title: 'Cinema', type: 'EXPERIENCE', iconKey: 'cinema' as const },
    deadlineAt: offerDeadline,
    createdAt: '2026-10-03T12:34:56.789Z',
  },
});
const mockPublishOffer = jest.fn().mockResolvedValue({
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
});
const parentNegotiationItems = [
  {
    offer: {
      id: 'counter-offer-test-id',
      familyId: 'family-test-id',
      parentUid: 'parent-test-uid',
      childUid: 'child-test-uid',
      status: 'AWAITING_PARENT' as const,
      currentRevisionId: 'counter-revision-test-id',
      createdAt: '2026-10-03T12:34:56.789Z',
      updatedAt: '2026-10-03T12:36:56.789Z',
    },
    revision: {
      id: 'counter-revision-test-id',
      offerId: 'counter-offer-test-id',
      revisionNumber: 2,
      proposedByUid: 'child-test-uid',
      proposedByRole: 'CHILD' as const,
      tasks: [{ title: 'Load the dishwasher', targetCount: 2 }],
      reward: {
        title: 'One hour of games',
        type: 'PRIVILEGE' as const,
        iconKey: 'screen-time' as const,
      },
      deadlineAt: '2026-10-10T18:00:00.000Z',
      note: 'This feels fair.',
      createdAt: '2026-10-03T12:36:56.789Z',
    },
  },
];
const mockParentNegotiationUnsubscribe = jest.fn();
const mockSubscribeToCurrentParentNegotiationInbox = jest.fn(
  (
    _familyId: string,
    onItems: (items: typeof parentNegotiationItems) => void,
    _onError: (error: unknown) => void,
  ) => {
    onItems(parentNegotiationItems);
    return mockParentNegotiationUnsubscribe;
  },
);

const mockSentInbox = jest.fn((...args: unknown[]) => {
  (args[1] as (items: unknown[]) => void)([]);
  return jest.fn();
});

const mockNavigate = jest.fn();
let mockPath = '/';
jest.mock('expo-router', () => ({
  Redirect: () => null,
  usePathname: () => mockPath,
  useFocusEffect: (effect: () => void) => mockUseEffect(effect, [effect]),
  useRouter: () => ({
    navigate: mockNavigate,
    push: mockNavigate,
    replace: mockNavigate,
  }),
}));

jest.mock('@chorex/firebase-client', () => ({
  useContractDetail: () => ({ status: 'loading' }),
  useReminderPreference: () => ({
    state: { enabled: true, busy: false },
    save: mockSaveReminder,
  }),
  useReceivedRewards: () => ({
    status: 'ready',
    rewards: [],
    fromCache: false,
  }),
  useAwaitingRewards: () => ({
    status: 'ready',
    rewards: [],
    fromCache: false,
  }),
  usePendingRewards: () => ({
    status: 'ready',
    rewards: mockAttentionRewards,
    fromCache: false,
  }),
  useActiveContracts: () => ({
    status: 'ready',
    contracts: [],
    fromCache: false,
  }),
  useReadyForReviewContracts: () => ({
    status: 'ready',
    contracts: mockAttentionReviews,
    fromCache: false,
  }),
  readCurrentParentFamily: jest.fn().mockResolvedValue({
    profile: {
      uid: 'parent-test-uid',
      displayName: 'Alex',
      accountType: 'PARENT',
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
      uid: 'parent-test-uid',
      familyId: 'family-test-id',
      role: 'PARENT',
      displayName: 'Alex',
      status: 'ACTIVE',
      joinedAt: '2026-10-03T12:34:56.789Z',
    },
    children: [
      {
        uid: 'child-test-uid',
        familyId: 'family-test-id',
        role: 'CHILD',
        displayName: 'Mia',
        status: 'ACTIVE',
        joinedAt: '2026-10-03T12:34:56.789Z',
      },
    ],
  }),
  createChild: jest.fn(),
  createFamily: jest.fn(),
  createOfferDraft: (...args: unknown[]) => mockCreateOfferDraft(...args),
  publishOffer: (...args: unknown[]) => mockPublishOffer(...args),
  subscribeToCurrentChildOfferInbox: (...args: unknown[]) =>
    mockSentInbox(...args),
  subscribeToCurrentParentNegotiationInbox: (
    familyId: string,
    onItems: (items: typeof parentNegotiationItems) => void,
    onError: (error: unknown) => void,
  ) => mockSubscribeToCurrentParentNegotiationInbox(familyId, onItems, onError),
  createPairingSession: jest.fn().mockResolvedValue({
    sessionId: 'pairing-session-id',
    token: 'AbCdEfGhIjKlMnOpQrStUw',
    code: '482731',
    expiresAt: '2026-10-03T12:44:56.789Z',
  }),
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
}));

jest.mock('../src/auth/session', () => ({
  useParentSession: () => ({
    user: { uid: 'parent-test-uid', email: 'parent@example.invalid' },
    notifications: mockUseDeviceRegistrationLifecycle('PARENT'),
    signOut: mockSignOut,
  }),
}));

jest.mock('../src/auth/messages', () => ({
  getAuthErrorMessage: () => 'Authentication could not be completed.',
}));

jest.mock('../src/family/messages', () => ({
  getFamilyErrorMessage: () => 'Family setup could not be completed.',
}));

jest.mock('../src/notifications/messages', () => ({
  getNotificationErrorMessage: () => 'Notifications could not be enabled.',
}));

it('renders the parent screen through the public shared UI package', async () => {
  const view = render(
    <AppNavigation>
      <HomeScreen />
    </AppNavigation>,
  );
  expect(screen.getByRole('header', { name: 'ChoreX' })).toBeOnTheScreen();
  await screen.findByText('Needs your attention');
  expect(screen.queryByText('Hello, Alex!')).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Notification settings' }),
  ).toBeNull();
  expect(screen.getByRole('button', { name: 'Settings' })).toBeOnTheScreen();
  expect(screen.queryByRole('tab', { name: 'All children' })).toBeNull();
  expect(screen.queryByRole('tab', { name: 'Mia' })).toBeNull();
  expect(screen.queryByRole('header', { name: 'Quick actions' })).toBeNull();

  expect(screen.queryByRole('header', { name: 'Select child' })).toBeNull();
  expect(screen.queryByText('Create an offer draft')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Create Offer' })).toBeNull();
  expect(
    screen.queryByRole('header', { name: 'Active agreements' }),
  ).toBeNull();
  expect(
    screen.queryByRole('header', { name: 'Rewards to fulfill' }),
  ).toBeNull();
  expect(screen.queryByText('This feels fair.')).toBeNull();
  for (const [label, route] of [
    ['Contracts', '/contracts'],
    ['Rewards', '/rewards'],
    ['Settings', '/more'],
    ['Home', '/'],
    ['Create order', '/offers/create'],
    ['Offers', '/offers'],
  ]) {
    fireEvent.press(
      screen.queryByRole('tab', { name: label }) ??
        screen.getAllByRole('button', { name: new RegExp('^' + label) })[0]!,
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenLastCalledWith(route));
    mockPath = route;
    view.rerender(
      <AppNavigation>
        <HomeScreen />
      </AppNavigation>,
    );
    await waitFor(() =>
      expect(screen.queryByTestId('navigation-loader')).toBeNull(),
    );
  }
  mockPath = '/rewards/reward-1';
  view.rerender(
    <AppNavigation>
      <HomeScreen />
    </AppNavigation>,
  );
  expect(screen.getByRole('tab', { name: 'Rewards' })).toBeSelected();
  mockPath = '/more';
  view.rerender(
    <AppNavigation>
      <ParentSurface area="more" />
    </AppNavigation>,
  );
  await screen.findByRole('header', { name: 'Notifications' });
  expect(screen.queryByRole('header', { name: 'Settings' })).toBeNull();
  expect(screen.getByText('Parent account')).toBeTruthy();
  expect(
    screen.getByRole('header', { name: 'Privacy & account' }),
  ).toBeTruthy();
  expect(mockRegisterCurrentDevice).not.toHaveBeenCalled();
  const reminderSwitch = screen.getByRole('switch', {
    name: 'Pending reward reminders',
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
  expect(mockRegisterCurrentDevice).toHaveBeenCalledWith('PARENT');
  fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
  expect(mockSignOut).toHaveBeenCalledTimes(1);
  view.rerender(
    <AppNavigation>
      <ParentSurface area="family" />
    </AppNavigation>,
  );
  await screen.findByText('Add a child');
  expect(screen.queryByRole('header', { name: 'Family' })).toBeNull();
  expect(screen.getByRole('header', { name: 'Children' })).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Pair device' }));
  expect(mockNavigate).toHaveBeenLastCalledWith({
    pathname: '/family/pair-device',
    params: { childUid: 'child-test-uid' },
  });
  expect(screen.queryByText('482 731')).toBeNull();
  view.rerender(
    <AppNavigation>
      <PairDeviceScreen childUid="child-test-uid" />
    </AppNavigation>,
  );
  expect(await screen.findByText('482 731')).toBeOnTheScreen();
  expect(createPairingSession).toHaveBeenCalledWith(
    expect.objectContaining({
      familyId: 'family-test-id',
      childUid: 'child-test-uid',
    }),
  );
  const firstPairingRequest = jest
    .mocked(createPairingSession)
    .mock.calls.at(-1)?.[0];
  fireEvent.press(screen.getByRole('button', { name: 'Create new code' }));
  await screen.findByText('482 731');
  const newPairingRequest = jest
    .mocked(createPairingSession)
    .mock.calls.at(-1)?.[0];
  expect(newPairingRequest?.idempotencyKey).not.toBe(
    firstPairingRequest?.idempotencyKey,
  );
  expect(screen.queryByText('Add a child')).toBeNull();
  view.rerender(
    <AppNavigation>
      <ParentSurface area="create" />
    </AppNavigation>,
  );
  expect(
    await screen.findByRole('header', { name: 'Choose reward' }),
  ).toBeOnTheScreen();
  expect(screen.queryByRole('header', { name: 'Select child' })).toBeNull();
  expect(screen.queryByText('Create an offer draft')).toBeNull();
  view.rerender(
    <AppNavigation>
      <ParentSurface area="offers" />
    </AppNavigation>,
  );
  await screen.findByRole('button', { name: 'View offer' });
  expect(screen.getByText('One hour of games')).toBeOnTheScreen();
  expect(
    screen.queryByRole('button', { name: 'Accept counteroffer' }),
  ).toBeNull();
  expect(readCurrentParentFamily).toHaveBeenCalledTimes(1);
});

it('shows a centered add-child action instead of home content when the family has no children', async () => {
  const home = await readCurrentParentFamily();
  if (!home) throw new Error('Missing test fixture');
  jest
    .mocked(readCurrentParentFamily)
    .mockResolvedValueOnce({ ...home, children: [] });
  render(
    <AppNavigation>
      <HomeScreen />
    </AppNavigation>,
  );
  const button = await screen.findByRole('button', { name: 'Add child' });
  expect(screen.getByText('Add your first child')).toBeOnTheScreen();
  expect(screen.queryByRole('tab', { name: 'All children' })).toBeNull();
  expect(
    screen.queryByRole('header', { name: 'Needs your attention' }),
  ).toBeNull();
  expect(
    screen.queryByRole('header', { name: 'Active agreements' }),
  ).toBeNull();
  fireEvent.press(button);
  expect(mockNavigate).toHaveBeenCalledWith('/family/add-child');
});

it('sends an offer in one step and shows the published result', async () => {
  render(
    <OfferDraftComposer
      activeChildren={[
        {
          uid: 'child-test-uid',
          familyId: 'family-test-id',
          role: 'CHILD',
          displayName: 'Mia',
          status: 'ACTIVE',
          joinedAt: '2026-10-03T12:34:56.789Z',
        },
      ]}
      familyId="family-test-id"
    />,
  );

  expect(screen.getByText('Cinema')).toBeOnTheScreen();
  expect(screen.queryByLabelText('Reward title')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Change' }));
  expect(
    screen.getByRole('button', {
      name: 'Choose Cinema reward',
      selected: true,
    }),
  ).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Choose Custom reward' }));
  fireEvent.changeText(screen.getByLabelText('Reward title'), '');
  fireEvent.press(screen.getByRole('button', { name: 'Send offer' }));
  expect(await screen.findByText('Enter a reward title.')).toBeOnTheScreen();
  fireEvent.changeText(screen.getByLabelText('Reward title'), 'C');
  expect(screen.queryByText('Enter a reward title.')).toBeNull();
  fireEvent.changeText(screen.getByLabelText('Reward title'), 'Cinema');
  expect(screen.getByLabelText('Reward title')).toHaveProp('value', 'Cinema');
  fireEvent.press(screen.getByRole('button', { name: 'Change' }));
  fireEvent.press(screen.getByRole('button', { name: 'Choose Plant reward' }));
  expect(screen.queryByLabelText('Reward title')).toBeNull();
  expect(screen.getByText('Plant')).toBeOnTheScreen();
  fireEvent.changeText(screen.getByLabelText('Task 1'), 'Load the dishwasher');
  fireEvent.press(screen.getByRole('button', { name: 'Send offer' }));

  expect(await screen.findByText('Offer published')).toBeOnTheScreen();
  expect(mockCreateOfferDraft).toHaveBeenCalledWith(
    expect.objectContaining({
      childUid: 'child-test-uid',
      reward: expect.objectContaining({
        title: 'Plant',
        type: 'ITEM',
        iconKey: 'plant',
      }),
    }),
  );

  expect(await screen.findByText('Offer published')).toBeOnTheScreen();
  expect(screen.getByText('Kids turn')).toBeOnTheScreen();
  expect(mockPublishOffer).toHaveBeenCalledWith(
    expect.objectContaining({
      offerId: 'offer-test-id',
      currentRevisionId: 'revision-test-id',
    }),
  );
});

it('retries sending the same offer without creating another draft', async () => {
  const home = await readCurrentParentFamily();
  if (!home) throw new Error('Missing test fixture');
  mockCreateOfferDraft.mockClear();
  mockPublishOffer.mockClear();
  mockPublishOffer.mockRejectedValueOnce(new Error('network failure'));
  render(
    <OfferDraftComposer
      familyId={home.family.id}
      activeChildren={home.children}
    />,
  );
  fireEvent.changeText(screen.getByLabelText('Task 1'), 'Water plants');
  fireEvent.press(screen.getByRole('button', { name: 'Send offer' }));
  const retry = await screen.findByRole('button', {
    name: 'Retry sending offer',
  });
  await waitFor(() => expect(retry).toBeEnabled());
  fireEvent.press(retry);
  expect(await screen.findByText('Offer published')).toBeOnTheScreen();
  expect(mockCreateOfferDraft).toHaveBeenCalledTimes(1);
  expect(mockPublishOffer).toHaveBeenCalledTimes(2);
  expect(mockPublishOffer.mock.calls[1][0]).toEqual(
    mockPublishOffer.mock.calls[0][0],
  );
});

it('uses the existing family and child commands before offering device pairing', async () => {
  const home = await readCurrentParentFamily();
  if (!home) throw new Error('Missing test fixture');
  jest.mocked(readCurrentParentFamily).mockResolvedValueOnce(null);
  jest.mocked(createFamily).mockResolvedValueOnce(home);
  jest.mocked(createChild).mockResolvedValueOnce({
    profile: {
      uid: 'new-child',
      displayName: 'Lea',
      accountType: 'CHILD',
      createdAt: home.profile.createdAt,
    },
    membership: { ...home.children[0]!, uid: 'new-child', displayName: 'Lea' },
  });
  const view = render(
    <AppNavigation>
      <ParentSurface area="family" />
    </AppNavigation>,
  );
  await screen.findByText('Create your family');
  fireEvent.changeText(screen.getByLabelText('Your name'), ' Alex ');
  fireEvent.changeText(screen.getByLabelText('Family name'), ' Rivera Family ');
  fireEvent.press(screen.getByRole('button', { name: 'Create family' }));
  await screen.findByText('Add a child');
  expect(screen.queryByRole('header', { name: 'Family' })).toBeNull();
  expect(screen.getByRole('header', { name: 'Children' })).toBeTruthy();
  expect(createFamily).toHaveBeenCalledWith({
    displayName: 'Alex',
    familyName: 'Rivera Family',
  });
  expect(screen.getByText(home.family.name)).toBeOnTheScreen();
  expect(screen.queryByLabelText("Child's name")).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Add a child' }));
  expect(mockNavigate).toHaveBeenCalledWith('/family/add-child');
  view.rerender(
    <AppNavigation>
      <ParentSurface area="add-child" />
    </AppNavigation>,
  );
  fireEvent.changeText(screen.getByLabelText("Child's name"), ' Lea ');
  fireEvent.press(screen.getByRole('button', { name: 'Create child profile' }));
  await waitFor(() =>
    expect(createChild).toHaveBeenCalledWith({
      familyId: home.family.id,
      displayName: 'Lea',
      idempotencyKey: expect.any(String),
    }),
  );
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/family'));
  expect(screen.getByLabelText("Child's name").props.value).toBe('');
  view.rerender(
    <AppNavigation>
      <ParentSurface area="family" />
    </AppNavigation>,
  );
  expect(
    await screen.findByRole('button', { name: 'Pair device' }),
  ).toBeOnTheScreen();
});

it('combines actionable attention sources and preserves each existing destination', async () => {
  const timestamp = '2026-10-03T12:34:56.789Z';
  mockAttentionReviews = [
    {
      id: 'review-contract',
      familyId: 'family-test-id',
      parentUid: 'parent-test-uid',
      childUid: 'child-test-uid',
      source: {
        type: 'OFFER',
        offerId: 'review-offer',
        revisionId: 'review-revision',
      },
      rewardTerms: { title: 'Book', type: 'ITEM', iconKey: 'gift' as const },
      deadlineAt: timestamp,
      status: 'READY_FOR_REVIEW',
      reviewCycle: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];
  mockAttentionRewards = [
    {
      id: 'delivery-reward',
      familyId: 'family-test-id',
      contractId: 'approved-contract',
      parentUid: 'parent-test-uid',
      childUid: 'child-test-uid',
      terms: {
        title: 'Cinema',
        type: 'EXPERIENCE',
        iconKey: 'cinema' as const,
      },
      status: 'PENDING_FULFILLMENT',
      earnedAt: timestamp,
    },
  ];
  const view = render(
    <HomeAttention
      familyId="family-test-id"
      authUid="parent-test-uid"
      childNames={{ 'child-test-uid': 'Mia' }}
    />,
  );
  await screen.findByRole('button', {
    name: /^Mia submitted for review: Book/,
  });
  for (const [label, destination] of [
    [
      'Mia submitted for review: Book',
      {
        pathname: '/contracts/[contractId]',
        params: { contractId: 'review-contract' },
      },
    ],
    [
      'Reward waiting for delivery: Cinema · Mia',
      {
        pathname: '/rewards/[rewardId]',
        params: { rewardId: 'delivery-reward' },
      },
    ],
  ] as const) {
    fireEvent.press(
      screen.queryByRole('tab', { name: label }) ??
        screen.getAllByRole('button', { name: new RegExp('^' + label) })[0]!,
    );
    expect(mockNavigate).toHaveBeenLastCalledWith(destination);
  }
  fireEvent.press(screen.getByRole('button', { name: /^Mia countered/ }));
  expect(mockNavigate).toHaveBeenLastCalledWith({
    pathname: '/offers/[offerId]',
    params: { offerId: 'counter-offer-test-id' },
  });
  expect(screen.getByLabelText('2 items')).toBeOnTheScreen();
  expect(screen.getByLabelText('1 items')).toBeOnTheScreen();
  expect(
    screen.getByRole('header', { name: 'Rewards to fulfill' }),
  ).toBeOnTheScreen();
  view.rerender(
    <HomeAttention
      familyId="family-test-id"
      authUid="parent-test-uid"
      childNames={{ 'child-test-uid': 'Mia' }}
      selectedChildUid="another-child"
    />,
  );
  expect(screen.queryByRole('button', { name: /^Mia countered/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /^Mia submitted/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /^Reward waiting/ })).toBeNull();
  view.unmount();
  mockAttentionReviews = [];
  mockAttentionRewards = [];
});

it('shows sent offers in a separate tab after counteroffers', async () => {
  mockSentInbox.mockImplementationOnce((...args: unknown[]) => {
    (args[1] as (items: unknown[]) => void)([
      {
        ...parentNegotiationItems[0],
        offer: { ...parentNegotiationItems[0].offer, status: 'AWAITING_CHILD' },
      },
    ]);
    return jest.fn();
  });
  mockSentInbox.mockImplementationOnce((...args: unknown[]) => {
    (args[1] as (items: unknown[]) => void)([
      {
        ...parentNegotiationItems[0],
        offer: { ...parentNegotiationItems[0].offer, status: 'AWAITING_CHILD' },
      },
    ]);
    return jest.fn();
  });
  render(
    <AppNavigation>
      <ParentSurface area="offers" />
    </AppNavigation>,
  );
  await screen.findByRole('tab', { name: 'Counteroffers' });
  const tabs = screen.getAllByRole('tab');
  expect(
    tabs
      .filter((tab) =>
        ['Counteroffers', 'Sent'].includes(tab.props.accessibilityLabel),
      )
      .map((tab) => tab.props.accessibilityLabel),
  ).toEqual(['Counteroffers', 'Sent']);
  fireEvent.press(screen.getByRole('tab', { name: 'Sent' }));
  expect(await screen.findByText('Kids turn')).toBeOnTheScreen();
  expect(
    screen.getByRole('button', { name: 'View offer: One hour of games' }),
  ).toBeOnTheScreen();
});

it('shows a create-offer action when the parent dashboard has no items', async () => {
  mockSubscribeToCurrentParentNegotiationInbox.mockImplementationOnce(
    (_familyId, onItems) => {
      onItems([]);
      return jest.fn();
    },
  );
  render(
    <AppNavigation>
      <HomeScreen />
    </AppNavigation>,
  );
  const button = await screen.findByRole('button', { name: 'Create offer' });
  expect(screen.getByText('Create your first offer')).toBeOnTheScreen();
  expect(screen.queryByText('Needs your attention')).toBeNull();
  fireEvent.press(button);
  expect(mockNavigate).toHaveBeenCalledWith('/offers/create');
});

it('hides awaiting-child offers from Home attention without showing the first-offer prompt', async () => {
  mockSubscribeToCurrentParentNegotiationInbox.mockImplementationOnce(
    (_familyId, onItems) => {
      onItems([]);
      return jest.fn();
    },
  );
  mockSentInbox.mockImplementationOnce((...args: unknown[]) => {
    (args[1] as (items: unknown[]) => void)([
      {
        ...parentNegotiationItems[0],
        offer: { ...parentNegotiationItems[0].offer, status: 'AWAITING_CHILD' },
      },
    ]);
    return jest.fn();
  });
  render(
    <HomeAttention
      familyId="family-test-id"
      authUid="parent-test-uid"
      childNames={{ 'child-test-uid': 'Mia' }}
    />,
  );
  expect(
    screen.queryByRole('button', {
      name: 'One hour of games: Mia · Waiting for a response',
    }),
  ).toBeNull();
  expect(screen.queryByText('Create your first offer')).toBeNull();
});
