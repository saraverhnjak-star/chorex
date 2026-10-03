import { fireEvent, render, screen } from '@testing-library/react-native';
import { createPairingSession } from '@chorex/firebase-client';
import HomeScreen from '../app/(app)/index';

const mockRegisterCurrentDevice = jest
  .fn()
  .mockResolvedValue({ status: 'registered' });

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
  expect(screen.getByText('Mia')).toBeOnTheScreen();
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
});
