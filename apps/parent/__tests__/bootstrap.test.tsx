import { useDeviceRegistrationLifecycle as mockUseDeviceRegistrationLifecycle } from '@chorex/notifications';
import { useState as mockUseState, useEffect as mockUseEffect } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  createPairingSession,
  readCurrentParentFamily,
} from '@chorex/firebase-client';
import HomeScreen from '../app/(app)/index';
import { ParentSurface } from '../src/navigation/ParentSurface';
import { AppNavigation } from '../src/navigation/AppNavigation';
import { OfferDraftComposer } from '../src/offers/OfferDraftComposer';

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
    reward: { title: 'Cinema', type: 'EXPERIENCE' },
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
    save: jest.fn(),
  }),
  useAwaitingRewards: () => ({
    status: 'ready',
    rewards: [],
    fromCache: false,
  }),
  usePendingRewards: () => ({ status: 'ready', rewards: [], fromCache: false }),
  useActiveContracts: () => ({
    status: 'ready',
    contracts: [],
    fromCache: false,
  }),
  useReadyForReviewContracts: () => ({
    status: 'ready',
    contracts: [],
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
    signOut: jest.fn(),
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
  expect(await screen.findByText('Hello, Alex!')).toBeOnTheScreen();
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
    ['See all Offers', '/offers'],
    ['See all Contracts', '/contracts'],
    ['See all Rewards', '/rewards'],
    ['Create Offer', '/offers/create'],
    ['Review Submissions', '/contracts'],
    ['Manage Rewards', '/rewards'],
    ['Family Overview', '/family'],
  ]) {
    fireEvent.press(screen.getByRole('button', { name: label }));
    expect(mockNavigate).toHaveBeenLastCalledWith(route);
  }
  mockPath = '/rewards/reward-1';
  view.rerender(
    <AppNavigation>
      <HomeScreen />
    </AppNavigation>,
  );
  expect(screen.getByRole('button', { name: 'Rewards' })).toBeSelected();
  mockPath = '/more';
  view.rerender(
    <AppNavigation>
      <ParentSurface area="more" />
    </AppNavigation>,
  );
  await screen.findByRole('header', { name: 'More' });
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
  expect(mockRegisterCurrentDevice).toHaveBeenCalledWith('PARENT');
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

  fireEvent.changeText(screen.getByLabelText('Task 1'), 'Load the dishwasher');
  fireEvent.changeText(screen.getByLabelText('Reward title'), 'Cinema');
  fireEvent.press(screen.getByRole('button', { name: 'Save offer draft' }));

  expect(await screen.findByText('Draft saved')).toBeOnTheScreen();
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
