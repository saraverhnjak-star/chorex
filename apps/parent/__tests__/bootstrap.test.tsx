import { fireEvent, render, screen } from '@testing-library/react-native';
import { createPairingSession } from '@chorex/firebase-client';
import HomeScreen from '../app/(app)/index';
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

jest.mock('@chorex/firebase-client', () => ({
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
  registerCurrentDevice: (...args: unknown[]) =>
    mockRegisterCurrentDevice(...args),
}));

jest.mock('../src/auth/session', () => ({
  useParentSession: () => ({
    user: { uid: 'parent-test-uid', email: 'parent@example.invalid' },
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
  render(<HomeScreen />);
  expect(
    screen.getByRole('header', { name: 'ChoreX Parent' }),
  ).toBeOnTheScreen();
  expect(await screen.findByText('Rivera Family')).toBeOnTheScreen();
  expect(
    screen.getByText('Welcome, Alex. Family setup is complete.'),
  ).toBeOnTheScreen();
  expect(screen.getAllByText('Mia')).toHaveLength(2);
  fireEvent.press(screen.getByRole('button', { name: 'Enable notifications' }));
  expect(mockRegisterCurrentDevice).toHaveBeenCalledWith('PARENT');
  fireEvent.press(screen.getByRole('button', { name: 'Pair device' }));
  expect(await screen.findByText('AbCdEfGhIjKlMnOpQrStUw')).toBeOnTheScreen();
  expect(createPairingSession).toHaveBeenCalledWith(
    expect.objectContaining({
      familyId: 'family-test-id',
      childUid: 'child-test-uid',
    }),
  );
  expect(screen.getByText('Add a child')).toBeOnTheScreen();
  expect(screen.getByText('Create an offer draft')).toBeOnTheScreen();
  expect(screen.getByText('Counteroffers')).toBeOnTheScreen();
  expect(screen.getByText('Status: Awaiting parent')).toBeOnTheScreen();
  expect(screen.getByText('One hour of games · PRIVILEGE')).toBeOnTheScreen();
  expect(screen.getByText('This feels fair.')).toBeOnTheScreen();
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
