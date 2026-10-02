import { render, screen } from '@testing-library/react-native';
import HomeScreen from '../app/(app)/index';

jest.mock('../src/auth/session', () => ({
  useParentSession: () => ({
    user: { uid: 'parent-test-uid', email: 'parent@example.invalid' },
    signOut: jest.fn(),
  }),
}));

jest.mock('../src/auth/messages', () => ({
  getAuthErrorMessage: () => 'Authentication could not be completed.',
}));

it('renders the parent screen through the public shared UI package', () => {
  render(<HomeScreen />);
  expect(
    screen.getByRole('header', { name: 'ChoreX Parent' }),
  ).toBeOnTheScreen();
});
