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

const mockNavigate = jest.fn();
let mockPath = '/';
jest.mock('expo-router', () => ({
  Redirect: () => null,
  usePathname: () => mockPath,
  useFocusEffect: (effect: () => void) => mockUseEffect(effect, [effect]),
  useRouter: () => ({ navigate: mockNavigate, push: mockNavigate }),
}));

jest.mock('@chorex/firebase-client', () => ({
  useContractDetail: () => ({ status: 'loading' }),
  useReminderPreference: () => ({
    state: { enabled: true, busy: false },
    save: mockSaveReminder,
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
  subscribeToCurrentParentNegotiationInbox: (
    familyId: string,
    onItems: (items: typeof parentNegotiationItems) => void,
    onError: (error: unknown) => void,
  ) => mockSubscribeToCurrentParentNegotiationInbox(familyId, onItems, onError),
  createPairingSession: jest.fn().mockResolvedValue({
    sessionId: 'pairing-session-id',
    token: 'AbCdEfGhIjKlMnOpQrStUw',
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
  expect(screen.queryByRole('header', { name: 'ChoreX' })).toBeNull();
  await screen.findByText('Mia');
  expect(screen.queryByText('Hello, Alex!')).toBeNull();
  expect(
    screen.getByRole('header', { name: 'Quick actions' }),
  ).toBeOnTheScreen();
  expect(screen.getByText('Mia')).toBeOnTheScreen();
  expect(screen.queryByText('Create an offer draft')).toBeNull();
  expect(screen.queryByText('This feels fair.')).toBeNull();
  for (const [label, route] of [
    ['Offers', '/offers'],
    ['Contracts', '/contracts'],
    ['Rewards', '/rewards'],
    ['More', '/more'],
    ['Home', '/'],
    ['See all Contracts', '/contracts'],
    ['Create Offer', '/offers/create'],
    ['Review Submissions', '/contracts'],
    ['Manage Rewards', '/rewards'],
    ['Family Overview', '/family'],
  ]) {
    fireEvent.press(
      screen.queryByRole('tab', { name: label }) ??
        screen.getByRole('button', { name: new RegExp('^' + label) }),
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
  await screen.findByRole('header', { name: 'Settings' });
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
  fireEvent.press(screen.getByRole('button', { name: 'Pair device' }));
  expect(await screen.findByText('AbCdEfGhIjKlMnOpQrStUw')).toBeOnTheScreen();
  expect(createPairingSession).toHaveBeenCalledWith(
    expect.objectContaining({
      familyId: 'family-test-id',
      childUid: 'child-test-uid',
    }),
  );
  expect(screen.getByText('Add a child')).toBeOnTheScreen();
  view.rerender(
    <AppNavigation>
      <ParentSurface area="create" />
    </AppNavigation>,
  );
  expect(await screen.findByText('Create an offer draft')).toBeOnTheScreen();
  view.rerender(
    <AppNavigation>
      <ParentSurface area="offers" />
    </AppNavigation>,
  );
  await screen.findByText('Counteroffers');
  expect(screen.getByText('Counteroffers')).toBeOnTheScreen();
  expect(screen.getByText('Your turn')).toBeOnTheScreen();
  expect(screen.getByText('One hour of games · PRIVILEGE')).toBeOnTheScreen();
  expect(screen.getByText('This feels fair.')).toBeOnTheScreen();
  expect(readCurrentParentFamily).toHaveBeenCalledTimes(1);
});

it('publishes the saved Offer draft and shows the published result', async () => {
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

  expect(screen.getByText('Selected reward: Cinema')).toBeOnTheScreen();
  expect(screen.queryByLabelText('Reward title')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Choose reward' }));
  expect(
    screen.getByRole('button', {
      name: 'Choose Cinema reward',
      selected: true,
    }),
  ).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Choose Custom reward' }));
  fireEvent.changeText(screen.getByLabelText('Reward title'), 'Cinema');
  expect(screen.getByLabelText('Reward title')).toHaveProp('value', 'Cinema');
  fireEvent.press(screen.getByRole('button', { name: 'Choose reward' }));
  fireEvent.press(screen.getByRole('button', { name: 'Choose Plant reward' }));
  expect(screen.queryByLabelText('Reward title')).toBeNull();
  expect(screen.getByText('Selected reward: Plant')).toBeOnTheScreen();
  fireEvent.changeText(screen.getByLabelText('Task 1'), 'Load the dishwasher');
  fireEvent.press(screen.getByRole('button', { name: 'Save offer draft' }));

  expect(await screen.findByText('Draft saved')).toBeOnTheScreen();
  expect(mockCreateOfferDraft).toHaveBeenCalledWith(
    expect.objectContaining({
      reward: expect.objectContaining({
        title: 'Plant',
        type: 'ITEM',
        iconKey: 'plant',
      }),
    }),
  );
  fireEvent.press(screen.getByRole('button', { name: 'Publish offer' }));

  expect(await screen.findByText('Offer published')).toBeOnTheScreen();
  expect(screen.getByText('Waiting for the child response.')).toBeOnTheScreen();
  expect(mockPublishOffer).toHaveBeenCalledWith(
    expect.objectContaining({
      offerId: 'offer-test-id',
      currentRevisionId: 'revision-test-id',
    }),
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
  render(
    <AppNavigation>
      <ParentSurface area="family" />
    </AppNavigation>,
  );
  await screen.findByText('Create your family');
  fireEvent.changeText(screen.getByLabelText('Your name'), ' Alex ');
  fireEvent.changeText(screen.getByLabelText('Family name'), ' Rivera Family ');
  fireEvent.press(screen.getByRole('button', { name: 'Create family' }));
  await screen.findByText('Add a child');
  expect(createFamily).toHaveBeenCalledWith({
    displayName: 'Alex',
    familyName: 'Rivera Family',
  });
  fireEvent.changeText(screen.getByLabelText("Child's name"), ' Lea ');
  fireEvent.press(screen.getByRole('button', { name: 'Create child profile' }));
  await waitFor(() =>
    expect(createChild).toHaveBeenCalledWith({
      familyId: home.family.id,
      displayName: 'Lea',
      idempotencyKey: expect.any(String),
    }),
  );
  expect(
    await screen.findByRole('button', { name: 'Pair device' }),
  ).toBeOnTheScreen();
  expect(screen.getByLabelText("Child's name").props.value).toBe('');
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
    name: /^Mia countered your offer: One hour of games/,
  });
  for (const [label, destination] of [
    ['Mia countered your offer: One hour of games', '/offers'],
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
        screen.getByRole('button', { name: new RegExp('^' + label) }),
    );
    expect(mockNavigate).toHaveBeenLastCalledWith(destination);
  }
  expect(screen.getByLabelText('3 items')).toBeOnTheScreen();
  view.unmount();
  mockAttentionReviews = [];
  mockAttentionRewards = [];
});
