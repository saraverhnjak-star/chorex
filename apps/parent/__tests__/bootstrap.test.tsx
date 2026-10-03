import { render, screen } from '@testing-library/react-native';
import HomeScreen from '../app/(app)/index';

jest.mock('@chorex/firebase-client', () => ({
  readCurrentParentProfile: jest.fn().mockResolvedValue({
    uid: 'parent-test-uid',
    displayName: 'Alex',
    accountType: 'PARENT',
    createdAt: '2026-10-03T12:34:56.789Z',
  }),
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
  expect(await screen.findByText('Family setup complete')).toBeOnTheScreen();
});
