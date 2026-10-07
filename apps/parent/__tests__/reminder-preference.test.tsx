import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useReminderPreference } from '../../../packages/firebase-client/src/useReminderPreference';
let mockValue: (value: { enabled: boolean; fromCache: boolean }) => void;
const mockSave = jest.fn(),
  mockStop = jest.fn();
jest.mock('../../../packages/firebase-client/src/index', () => ({
  subscribeReminderPreference: jest.fn((_uid, _role, callback) => {
    mockValue = callback;
    return mockStop;
  }),
  saveReminderPreference: (...args: unknown[]) => mockSave(...args),
}));
beforeEach(() => jest.clearAllMocks());
it('saves only its role preference, waits for persistence and keeps failure auxiliary', async () => {
  const { result } = renderHook(() =>
    useReminderPreference('parent', 'PARENT'),
  );
  expect(result.current.state.enabled).toBeUndefined();
  act(() => mockValue({ enabled: true, fromCache: false }));
  let finish!: () => void;
  mockSave.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  let action!: Promise<void>;
  act(() => {
    action = result.current.save(false);
  });
  expect(result.current.state.enabled).toBe(true);
  expect(result.current.state.busy).toBe(true);
  expect(mockSave).toHaveBeenCalledWith('parent', 'PARENT', false);
  await act(async () => {
    finish();
    await action;
  });
  expect(result.current.state.busy).toBe(false);
  act(() => mockValue({ enabled: false, fromCache: false }));
  expect(result.current.state.enabled).toBe(false);
  mockSave.mockRejectedValueOnce(Error('offline'));
  await act(() => result.current.save(true));
  expect(result.current.state.enabled).toBe(false);
  expect(result.current.state.error).toContain('could not be saved');
});
it('account switching removes old listener and ignores old save results', async () => {
  const { result, rerender } = renderHook(
    ({ uid }: { uid: string }) => useReminderPreference(uid, 'CHILD'),
    { initialProps: { uid: 'A' } },
  );
  act(() => mockValue({ enabled: true, fromCache: false }));
  let reject!: (error: Error) => void;
  mockSave.mockImplementationOnce(
    () =>
      new Promise((_resolve, failure) => {
        reject = failure;
      }),
  );
  let action!: Promise<void>;
  act(() => {
    action = result.current.save(false);
  });
  rerender({ uid: 'B' });
  expect(mockStop).toHaveBeenCalled();
  expect(result.current.state.enabled).toBeUndefined();
  act(() => mockValue({ enabled: true, fromCache: true }));
  await act(async () => {
    reject(Error('offline'));
    await action;
  });
  await waitFor(() => expect(result.current.state.enabled).toBe(true));
  expect(result.current.state.error).toBeUndefined();
});
