import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import PrivacyScreen from '../app/(app)/privacy';
const mockDelete = jest.fn();
jest.mock('@chorex/firebase-client', () => ({
  requestParentAccountDeletion: (...args: unknown[]) => mockDelete(...args),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'privacy-retry-key' }));
beforeEach(() => jest.clearAllMocks());
it('requires explicit confirmation, clears the password and reuses the retry key without sending ownership fields', async () => {
  mockDelete.mockRejectedValue({
    details: { code: 'ACCOUNT_DELETION_SCOPE_UNSUPPORTED' },
  });
  render(<PrivacyScreen />);
  expect(screen.queryByLabelText('Verify your password')).toBeNull();
  fireEvent.press(screen.getByText('Delete account…'));
  fireEvent.changeText(
    screen.getByLabelText('Verify your password'),
    'ephemeral-password',
  );
  fireEvent.press(screen.getByText('Permanently delete account and family'));
  await waitFor(() =>
    expect(screen.getByText(/Deletion needs a support review/)).toBeTruthy(),
  );
  expect(screen.getByLabelText('Verify your password').props.value).toBe('');
  const input = mockDelete.mock.calls[0][1];
  expect(input).toEqual({
    idempotencyKey: expect.any(String),
    confirmation: 'DELETE_ACCOUNT_AND_FAMILY',
  });
  fireEvent.changeText(
    screen.getByLabelText('Verify your password'),
    'ephemeral-password',
  );
  fireEvent.press(screen.getByText('Permanently delete account and family'));
  await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(2));
  expect(mockDelete.mock.calls[1][1]).toEqual(input);
});
it('cancel removes the ephemeral credential and confirmation form', () => {
  render(<PrivacyScreen />);
  fireEvent.press(screen.getByText('Delete account…'));
  fireEvent.changeText(
    screen.getByLabelText('Verify your password'),
    'ephemeral-password',
  );
  fireEvent.press(screen.getByText('Cancel'));
  fireEvent.press(screen.getByText('Delete account…'));
  expect(screen.getByLabelText('Verify your password').props.value).toBe('');
  expect(mockDelete).not.toHaveBeenCalled();
});
