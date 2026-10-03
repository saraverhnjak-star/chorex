import { render, screen } from '@testing-library/react-native';
import HomeScreen from '../app/(app)/index';

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
  expect(screen.getByText('Add a child')).toBeOnTheScreen();
});
