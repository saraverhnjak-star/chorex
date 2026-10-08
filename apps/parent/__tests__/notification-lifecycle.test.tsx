import {
  act,
  render,
  screen,
  fireEvent,
  renderHook,
  waitFor,
} from '@testing-library/react-native';
import { NotificationPermissionCard, ReminderPreferenceCard } from '@chorex/ui';
import { AppState, View, type AppStateStatus } from 'react-native';
import {
  useDeviceRegistrationLifecycle,
  useNotificationEducation,
} from '../../../packages/notifications/src/lifecycle';
const mockRegister = jest.fn();
const mockResume = jest.fn();
const mockSeen = jest.fn(async () => false);
const mockMarkSeen = jest.fn(async () => undefined);
let mockToken: (token: { type: 'ios'; data: string }) => void;
const mockRemoveToken = jest.fn();
jest.mock('expo-notifications', () => ({
  addPushTokenListener: (callback: typeof mockToken) => {
    mockToken = callback;
    return { remove: mockRemoveToken };
  },
}));
jest.mock('../../../packages/notifications/src/index', () => ({
  registerCurrentDevice: (...args: unknown[]) => mockRegister(...args),
  resumeDeviceRegistration: (...args: unknown[]) => mockResume(...args),
  readNotificationEducationSeen: () => mockSeen(),
  markNotificationEducationSeen: () => mockMarkSeen(),
}));
const permission = {
  status: 'undetermined' as const,
  granted: false,
  canAskAgain: true,
};
beforeEach(() => {
  jest.clearAllMocks();
  mockRegister.mockImplementation(async (_variant, options) => {
    options.onPermission(permission);
    return { status: 'denied' };
  });
});
it('does nothing before authentication and bootstrap never asks permission', async () => {
  const { result, rerender } = renderHook(
    ({ uid }: { uid?: string }) => useDeviceRegistrationLifecycle('CHILD', uid),
    { initialProps: { uid: undefined } },
  );
  expect(mockRegister).not.toHaveBeenCalled();
  rerender({ uid: 'child-1' });
  await waitFor(() => expect(result.current.state.status).toBe('off'));
  expect(mockRegister).toHaveBeenCalledWith(
    'CHILD',
    expect.objectContaining({ requestPermission: false }),
  );
  expect(mockResume).toHaveBeenCalledWith('child-1');
  await act(() => result.current.enable());
  expect(mockRegister).toHaveBeenLastCalledWith(
    'CHILD',
    expect.objectContaining({ requestPermission: true }),
  );
});
it('publishes success only after persistence and keeps failures auxiliary', async () => {
  let finish!: (value: unknown) => void;
  mockRegister.mockImplementation((_variant, options) => {
    options.onPermission({ status: 'granted', granted: true });
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const { result } = renderHook(() =>
    useDeviceRegistrationLifecycle('PARENT', 'parent-1'),
  );
  await waitFor(() =>
    expect(result.current.state.permission?.granted).toBe(true),
  );
  expect(result.current.state.status).toBe('loading');
  await act(async () => finish({ status: 'registered' }));
  expect(result.current.state.status).toBe('registered');
  mockRegister.mockRejectedValueOnce(Error('offline'));
  await act(() => result.current.enable());
  expect(result.current.state.status).toBe('error');
  expect(result.current.state.permission?.granted).toBe(true);
});
it('reconciles resume and token signals, coalesces in-flight replacement and removes listeners', async () => {
  let appChange!: (value: AppStateStatus) => void;
  const remove = jest.fn();
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, callback) => {
      appChange = callback;
      return { remove };
    });
  const { result, unmount } = renderHook(() =>
    useDeviceRegistrationLifecycle('PARENT', 'parent-1'),
  );
  await waitFor(() => expect(result.current.state.status).toBe('off'));
  await act(async () => {
    appChange('background');
    appChange('active');
  });
  expect(mockRegister).toHaveBeenCalledTimes(2);
  let finish!: (value: unknown) => void;
  mockRegister.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  let action!: Promise<void>;
  act(() => {
    action = result.current.enable();
    mockToken({ type: 'ios', data: 'native-test-token' });
    mockToken({ type: 'ios', data: 'native-test-token' });
  });
  await act(async () => {
    finish({ status: 'registered' });
    await action;
  });
  await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(4));
  unmount();
  expect(remove).toHaveBeenCalled();
  expect(mockRemoveToken).toHaveBeenCalled();
  jest.restoreAllMocks();
});
it('ignores stale UI work after account switching', async () => {
  let finish!: (value: unknown) => void;
  mockRegister.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result, rerender } = renderHook(
    ({ uid }: { uid: string }) => useDeviceRegistrationLifecycle('PARENT', uid),
    { initialProps: { uid: 'A' } },
  );
  rerender({ uid: 'B' });
  await waitFor(() => expect(result.current.state.status).toBe('off'));
  await act(async () => finish({ status: 'registered' }));
  expect(result.current.state.status).toBe('off');
});
it('shows education only in an authenticated undetermined context, Not now persists, explicit revisit remains available', async () => {
  const { result, rerender, unmount } = renderHook(
    ({ uid }: { uid?: string }) => useNotificationEducation(uid, permission),
    { initialProps: { uid: undefined } },
  );
  expect(mockSeen).not.toHaveBeenCalled();
  rerender({ uid: 'child-1' });
  await waitFor(() => expect(result.current.showEducation).toBe(true));
  expect(mockMarkSeen).toHaveBeenCalledTimes(1);
  act(() => result.current.skip());
  expect(result.current.showEducation).toBe(false);
  expect(mockRegister).not.toHaveBeenCalled();
  unmount();
  const restart = renderHook(() =>
    useNotificationEducation('child-1', permission),
  );
  expect(restart.result.current.showEducation).toBe(false);
  act(() => restart.result.current.revisit());
  expect(restart.result.current.showEducation).toBe(true);
});

it('does not register in a loop when native acquisition emits the same token again', async () => {
  const previousAppState = AppState.currentState;
  AppState.currentState = 'active';
  let nativeToken = 'same-native-test-token';
  mockRegister.mockImplementation(async (_variant, options) => {
    options.onPermission({ status: 'granted', granted: true });
    await Promise.resolve();
    mockToken({ type: 'ios', data: nativeToken });
    return { status: 'registered' };
  });
  const { result } = renderHook(() =>
    useDeviceRegistrationLifecycle('PARENT', 'parent-1'),
  );
  await waitFor(() => expect(result.current.state.status).toBe('registered'));
  expect(mockRegister).toHaveBeenCalledTimes(2);
  await act(async () =>
    mockToken({ type: 'ios', data: 'same-native-test-token' }),
  );
  expect(mockRegister).toHaveBeenCalledTimes(2);
  nativeToken = 'rotated-native-test-token';
  await act(async () => mockToken({ type: 'ios', data: nativeToken }));
  await waitFor(() => expect(result.current.state.status).toBe('registered'));
  expect(mockRegister).toHaveBeenCalledTimes(3);
  AppState.currentState = previousAppState;
  jest.restoreAllMocks();
});

it('Settings presents real channel states and separates reminder preference from OS permission', () => {
  const onEnable = jest.fn(),
    onSettings = jest.fn(),
    onChange = jest.fn();
  const props = {
    benefit: 'Get agreement updates.',
    education: false,
    busy: false,
    registered: false,
    settingsRequired: false,
    onEnable,
    onSkip: jest.fn(),
    onSettings,
  };
  const view = render(<NotificationPermissionCard {...props} busy />, {
    wrapper: ({ children }) => <View>{children}</View>,
  });
  expect(screen.getByText('Checking notifications…')).toBeOnTheScreen();
  expect(screen.queryByText('Notifications off')).not.toBeOnTheScreen();
  view.rerender(
    <NotificationPermissionCard {...props} registered permissionGranted />,
  );
  expect(screen.getByText('Notifications on')).toBeOnTheScreen();
  view.rerender(<NotificationPermissionCard {...props} registered quiet />);
  expect(
    screen.getByText('ChoreX can send quiet notifications to this device.'),
  ).toBeOnTheScreen();
  view.rerender(
    <NotificationPermissionCard
      {...props}
      permissionGranted
      error="Connection unavailable."
    />,
  );
  expect(screen.getByText('Notifications unavailable')).toBeOnTheScreen();
  expect(screen.queryByText('Notifications on')).not.toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: 'Retry notifications' }));
  expect(onEnable).toHaveBeenCalledTimes(1);
  view.rerender(
    <NotificationPermissionCard {...props} error="Connection unavailable." />,
  );
  expect(screen.getByText('Notifications unavailable')).toBeOnTheScreen();
  expect(
    screen.getByText('Notification status could not be checked. Try again.'),
  ).toBeOnTheScreen();
  view.rerender(
    <>
      <NotificationPermissionCard {...props} settingsRequired />
      <ReminderPreferenceCard
        label="Deadline reminders"
        description="Get a reminder when an agreement is due soon."
        enabled
        busy={false}
        onChange={onChange}
      />
    </>,
  );
  expect(screen.getByText('Notifications off')).toBeOnTheScreen();
  expect(onSettings).not.toHaveBeenCalled();
  expect(
    screen.getByRole('switch', { name: 'Deadline reminders' }).props.value,
  ).toBe(true);
  fireEvent(
    screen.getByRole('switch', { name: 'Deadline reminders' }),
    'valueChange',
    false,
  );
  expect(onChange).toHaveBeenCalledWith(false);
  expect(onEnable).toHaveBeenCalledTimes(1);
  fireEvent.press(
    screen.getByRole('button', { name: 'Open notification settings' }),
  );
  expect(onSettings).toHaveBeenCalledTimes(1);
  view.rerender(
    <ReminderPreferenceCard
      label="Deadline reminders"
      description="Optional reminders."
      busy={false}
      onChange={onChange}
    />,
  );
  expect(screen.queryByRole('switch')).not.toBeOnTheScreen();
  expect(screen.getByText('Loading reminder setting…')).toBeOnTheScreen();
});
