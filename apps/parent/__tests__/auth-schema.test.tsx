import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import SignInScreen from '../app/sign-in';
import RegisterScreen from '../app/register';
import {
  registrationCredentialsSchema,
  signInCredentialsSchema,
} from '@chorex/domain';

describe('parent authentication credentials', () => {
  it('rejects an invalid email address', () => {
    expect(
      signInCredentialsSchema.safeParse({
        email: 'not-an-email',
        password: 'secret',
      }).success,
    ).toBe(false);
  });

  it.each([
    {
      email: 'parent@example.invalid',
      password: 'short',
      confirmPassword: 'short',
    },
    {
      email: 'parent@example.invalid',
      password: 'valid-password',
      confirmPassword: 'different-password',
    },
  ])('rejects invalid registration passwords', (credentials) => {
    expect(registrationCredentialsSchema.safeParse(credentials).success).toBe(
      false,
    );
  });

  it('accepts valid credentials and trims surrounding email whitespace', () => {
    expect(
      registrationCredentialsSchema.parse({
        email: '  parent@example.invalid  ',
        password: 'valid-password',
        confirmPassword: 'valid-password',
      }),
    ).toEqual({
      email: 'parent@example.invalid',
      password: 'valid-password',
      confirmPassword: 'valid-password',
    });
  });
});

jest.mock('@chorex/firebase-client', () => ({
  authErrorCodes: {
    invalidCredentials: 'INVALID_CREDENTIALS',
    invalidEmail: 'INVALID_EMAIL',
    emailAlreadyInUse: 'EMAIL_ALREADY_IN_USE',
    weakPassword: 'WEAK_PASSWORD',
    tooManyAttempts: 'TOO_MANY_ATTEMPTS',
    networkUnavailable: 'NETWORK_UNAVAILABLE',
    unknown: 'UNKNOWN_AUTH_FAILURE',
  },
  isAuthClientError: () => false,
}));
const mockSignIn = jest.fn();
const mockRegister = jest.fn();
jest.mock('../src/auth/session', () => ({
  useParentSession: () => ({ signIn: mockSignIn, register: mockRegister }),
}));
jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

it('submits normalized sign-in credentials and keeps mapped failures inline', async () => {
  mockSignIn.mockRejectedValueOnce(new Error('private provider detail'));
  render(<SignInScreen />);
  fireEvent.changeText(
    screen.getByLabelText('Email'),
    ' parent@example.invalid ',
  );
  fireEvent.changeText(screen.getByLabelText('Password'), 'test-password');
  fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  await waitFor(() =>
    expect(mockSignIn).toHaveBeenCalledWith({
      email: 'parent@example.invalid',
      password: 'test-password',
    }),
  );
  expect(
    await screen.findByText(
      'Authentication could not be completed. Try again.',
    ),
  ).toBeOnTheScreen();
  expect(screen.queryByText('private provider detail')).toBeNull();
});

it('registers with existing fields and excludes password confirmation from the auth call', async () => {
  mockRegister.mockResolvedValueOnce(undefined);
  render(<RegisterScreen />);
  fireEvent.changeText(
    screen.getByLabelText('Email'),
    'parent@example.invalid',
  );
  fireEvent.changeText(screen.getByLabelText('Password'), 'test-password');
  fireEvent.changeText(
    screen.getByLabelText('Confirm password'),
    'test-password',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
  await waitFor(() =>
    expect(mockRegister).toHaveBeenCalledWith({
      email: 'parent@example.invalid',
      password: 'test-password',
    }),
  );
});
