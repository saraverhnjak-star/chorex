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
const mockReadCurrentChildOfferInbox = jest.fn().mockResolvedValue([
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
]);
const mockRegisterCurrentDevice = jest
  .fn()
  .mockResolvedValue({ status: 'registered' });
const mockRemoveCurrentDeviceRegistration = jest
  .fn()
  .mockResolvedValue(undefined);

jest.mock('@chorex/firebase-client', () => ({
  observeAuthState: jest.fn((listener) => {
    mockAuthListener = listener;
    listener(mockAuthUser);
    return jest.fn();
  }),
  redeemPairingSession: (...args: unknown[]) =>
    mockRedeemPairingSession(...args),
  readCurrentChildFamily: (...args: unknown[]) =>
    mockReadCurrentChildFamily(...args),
  readCurrentChildOfferInbox: (...args: unknown[]) =>
    mockReadCurrentChildOfferInbox(...args),
  signInWithChildCustomToken: (...args: unknown[]) =>
    mockSignInWithChildCustomToken(...args),
  signOutCurrentUser: jest.fn(),
}));

jest.mock('@chorex/notifications', () => ({
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
  expect(await screen.findByText('Rivera Family')).toBeOnTheScreen();
  expect(
    screen.getByText('Welcome, Mia. Your family is ready.'),
  ).toBeOnTheScreen();
  expect(await screen.findByText('Load the dishwasher · 2×')).toBeOnTheScreen();
  expect(screen.getByText('Cinema · EXPERIENCE')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Enable notifications' }));
  expect(mockRegisterCurrentDevice).toHaveBeenCalledWith('CHILD');
  expect(mockRedeemPairingSession).toHaveBeenCalledWith(
    expect.objectContaining({ token: 'AbCdEfGhIjKlMnOpQrStUw' }),
  );
  expect(mockSignInWithChildCustomToken).toHaveBeenCalledWith(
    'firebase-custom-token',
  );

  firstLaunch.unmount();
  render(
    <ChildSessionProvider>
      <HomeScreen />
    </ChildSessionProvider>,
  );
  await waitFor(() =>
    expect(screen.getByText('Rivera Family')).toBeOnTheScreen(),
  );
  expect(
    screen.getByText('Welcome, Mia. Your family is ready.'),
  ).toBeOnTheScreen();
  expect(mockReadCurrentChildFamily).toHaveBeenCalledTimes(2);
  expect(mockReadCurrentChildOfferInbox).toHaveBeenCalledWith('family-test-id');
});
