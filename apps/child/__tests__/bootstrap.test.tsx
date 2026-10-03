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

jest.mock('@chorex/firebase-client', () => ({
  observeAuthState: jest.fn((listener) => {
    mockAuthListener = listener;
    listener(mockAuthUser);
    return jest.fn();
  }),
  redeemPairingSession: (...args: unknown[]) =>
    mockRedeemPairingSession(...args),
  signInWithChildCustomToken: (...args: unknown[]) =>
    mockSignInWithChildCustomToken(...args),
}));

jest.mock('../src/pairing/messages', () => ({
  getPairingErrorMessage: () => 'Pairing could not be completed.',
}));

it('pairs, signs in, and restores the persisted child session', async () => {
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
  expect(await screen.findByText('Device paired')).toBeOnTheScreen();
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
    expect(screen.getByText('Device paired')).toBeOnTheScreen(),
  );
});
