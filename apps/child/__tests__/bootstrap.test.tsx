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
  signInWithChildCustomToken: (...args: unknown[]) =>
    mockSignInWithChildCustomToken(...args),
}));

jest.mock('../src/pairing/messages', () => ({
  getPairingErrorMessage: () => 'Pairing could not be completed.',
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
});
