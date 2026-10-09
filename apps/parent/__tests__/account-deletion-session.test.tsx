import { act, renderHook, waitFor } from '@testing-library/react-native';
import { ParentSessionProvider, useParentSession } from '../src/auth/session';
import {
  ChildSessionProvider,
  useChildSession,
} from '../../child/src/auth/session';
const mockRemove = jest.fn();
const mockAbandon = jest.fn();
const mockClear = jest.fn();
let mockDeleted: () => void;
jest.mock('@chorex/firebase-client', () => ({
  observeAuthState: (callback: (user: unknown) => void) => {
    callback({ uid: 'fixture', email: null });
    return () => {};
  },
  observeAccountDeletion: (_uid: string, callback: () => void) => {
    mockDeleted = callback;
    return () => {};
  },
  clearAccountSession: () => mockClear(),
}));
jest.mock('@chorex/notifications', () => ({
  useDeviceRegistrationLifecycle: () => ({ state: { status: 'off' } }),
  removeCurrentDeviceRegistration: () => mockRemove(),
  abandonDeletedAccountNotifications: () => mockAbandon(),
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockRemove.mockResolvedValue(undefined);
  mockAbandon.mockResolvedValue(undefined);
  mockClear.mockResolvedValue(undefined);
});
it.each([
  ['Parent', ParentSessionProvider, useParentSession],
  ['Child', ChildSessionProvider, useChildSession],
] as const)(
  '%s deletion closes protected state and tears down without denied registration deletion',
  async (_name, wrapper, hook) => {
    let finish!: () => void;
    mockClear.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const { result } = renderHook(
      (): { status: string; user: { uid: string } | null } => hook(),
      { wrapper },
    );
    await waitFor(() => expect(result.current.user?.uid).toBe('fixture'));
    await act(async () => {
      mockDeleted();
    });
    expect(result.current.status).toBe('loading');
    expect(result.current.user).toBeNull();
    expect(mockAbandon).toHaveBeenCalledTimes(1);
    expect(mockRemove).not.toHaveBeenCalled();
    await act(async () => {
      finish();
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.user).toBeNull();
  },
);
it('ordinary sign-out preserves Auth/UI when backend cleanup fails', async () => {
  mockRemove.mockRejectedValue(Error('offline'));
  const { result } = renderHook(useParentSession, {
    wrapper: ParentSessionProvider,
  });
  await waitFor(() => expect(result.current.user?.uid).toBe('fixture'));
  await act(async () => {
    await expect(result.current.signOut()).rejects.toThrow('offline');
  });
  expect(result.current.user?.uid).toBe('fixture');
  expect(mockClear).not.toHaveBeenCalled();
});
