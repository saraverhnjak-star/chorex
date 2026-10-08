import React from 'react';
import { act, render } from '@testing-library/react-native';
import {
  createNotificationResponseCoordinator,
  parseNotificationRoutingIntent,
} from '@chorex/notifications/core';
import RootLayout from '../app/_layout';
import { configureFirebase } from '../src/firebase';
import { resolveParentNotificationRoute } from '../src/notifications/routing';

let mockSession: {
  status: 'loading' | 'ready' | 'error';
  user: { uid: string } | null;
};
let mockRouterKey: string | undefined;
let mockCoordinator: ReturnType<typeof createNotificationResponseCoordinator>;
let mockTap: (response: unknown) => void;
let mockInitial: unknown;
const mockReplace = jest.fn();
const mockSessionRead = jest.fn();
const mockRouter = { replace: mockReplace };
jest.mock('../global.css', () => ({}));
jest.mock('../src/firebase', () => ({
  configureFirebase: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/auth/session', () => ({
  ParentSessionProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useParentSession: () => {
    mockSessionRead();
    return mockSession;
  },
}));
jest.mock('expo-router', () => {
  const Stack = ({ children }: { children: React.ReactNode }) => children;
  Stack.Screen = function Screen() {
    return null;
  };
  Stack.Protected = function Protected({
    children,
    guard,
  }: {
    children: React.ReactNode;
    guard: boolean;
  }) {
    return guard ? children : null;
  };
  return {
    Stack,
    usePathname: () => '/',
    useRouter: () => mockRouter,
    useRootNavigationState: () =>
      mockRouterKey ? { key: mockRouterKey } : undefined,
  };
});
jest.mock('@chorex/notifications', () => ({
  configureForegroundNotifications: jest.fn(),
  updateNotificationRoutingReadiness: (
    readiness: Parameters<typeof mockCoordinator.update>[0],
  ) => mockCoordinator.update(readiness),
  listenForNotificationResponses: (
    navigate: Parameters<typeof mockCoordinator.attach>[0],
  ) => {
    const detach = mockCoordinator.attach(navigate);
    mockTap = (response) => {
      mockCoordinator.receive(response);
    };
    if (mockInitial) mockCoordinator.receive(mockInitial);
    return detach;
  },
}));
const payload = (patch: Record<string, unknown> = {}) => ({
  type: 'CONTRACT_SUBMITTED',
  entityType: 'CONTRACT',
  entityId: 'contract-1',
  familyId: 'family-1',
  ...patch,
});
const response = (id = 'response', data = payload()) => ({
  actionIdentifier: 'DEFAULT',
  notification: { request: { identifier: id, content: { data } } },
});
async function renderBootstrapped() {
  const view = render(<RootLayout />);
  await act(async () => {});
  return view;
}
beforeEach(() => {
  mockReplace.mockClear();
  mockSessionRead.mockClear();
  jest
    .mocked(configureFirebase)
    .mockReset()
    .mockResolvedValue({} as never);
  mockCoordinator = createNotificationResponseCoordinator('DEFAULT');
  mockSession = { status: 'loading', user: null };
  mockRouterKey = undefined;
  mockInitial = null;
});
it('root captures a cold tap before Auth restoration and routes once after Auth and navigation mount', async () => {
  mockInitial = response();
  const view = await renderBootstrapped();
  expect(mockReplace).not.toHaveBeenCalled();
  mockSession = { status: 'ready', user: { uid: 'parent-1' } };
  view.rerender(<RootLayout />);
  expect(mockReplace).not.toHaveBeenCalled();
  mockRouterKey = 'root';
  view.rerender(<RootLayout />);
  expect(mockReplace).toHaveBeenCalledTimes(1);
  expect(mockReplace).toHaveBeenCalledWith('/contracts/contract-1');
  act(() => mockTap(response()));
  view.rerender(<RootLayout />);
  expect(mockReplace).toHaveBeenCalledTimes(1);
  view.unmount();
  await renderBootstrapped();
  expect(mockReplace).toHaveBeenCalledTimes(1);
});
it('signed-out or failed restoration consumes pending tap without bypassing existing auth UI', async () => {
  mockInitial = response();
  const view = await renderBootstrapped();
  mockSession = { status: 'ready', user: null };
  mockRouterKey = 'root';
  view.rerender(<RootLayout />);
  expect(mockReplace).not.toHaveBeenCalled();
  mockSession = { status: 'ready', user: { uid: 'other-user' } };
  view.rerender(<RootLayout />);
  expect(mockReplace).not.toHaveBeenCalled();
});
it('ready/background response uses this binary route mapping; receipt alone never routes', async () => {
  mockSession = { status: 'ready', user: { uid: 'parent-1' } };
  mockRouterKey = 'root';
  await renderBootstrapped();
  expect(mockReplace).not.toHaveBeenCalled();
  act(() => mockTap(response('accepted', payload({ type: 'OFFER_ACCEPTED' }))));
  expect(mockReplace).toHaveBeenLastCalledWith('/contracts/contract-1');
  act(() =>
    mockTap(
      response(
        'reward',
        payload({
          type: 'REWARD_DELIVERED',
          entityType: 'REWARD',
          entityId: 'reward-1',
        }),
      ),
    ),
  );
  expect(mockReplace).toHaveBeenLastCalledWith('/rewards/reward-1');
  act(() =>
    mockTap(
      response(
        'offer',
        payload({
          type: 'OFFER_COUNTERED',
          entityType: 'OFFER',
          entityId: 'offer-1',
        }),
      ),
    ),
  );
  expect(mockReplace).toHaveBeenLastCalledWith('/offers');
});
it('explicit Parent entity mapping preserves current semantic routes and rejects unsupported/private/path payloads', () => {
  for (const type of [
    'OFFER_ACCEPTED',
    'CONTRACT_SUBMITTED',
    'CONTRACT_CHANGES_REQUESTED',
    'CONTRACT_APPROVED',
  ]) {
    const intent = parseNotificationRoutingIntent(payload({ type }));
    expect(intent).toBeDefined();
    expect(resolveParentNotificationRoute(intent!)).toBe(
      '/contracts/contract-1',
    );
  }
  const offer = parseNotificationRoutingIntent(
    payload({
      type: 'OFFER_PUBLISHED',
      entityType: 'OFFER',
      entityId: 'offer-1',
    }),
  );
  expect(resolveParentNotificationRoute(offer!)).toBe('/offers');
  for (const patch of [
    { entityType: 'AUCTION' },
    { entityId: '../other' },
    { url: 'chorex-other://admin' },
    { note: 'private' },
  ])
    expect(parseNotificationRoutingIntent(payload(patch))).toBeUndefined();
});

it('session and Firebase consumers remain unmounted until bootstrap succeeds, including failed setup', async () => {
  let rejectBootstrap!: (error: Error) => void;
  jest.mocked(configureFirebase).mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        rejectBootstrap = reject;
      }),
  );
  const view = render(<RootLayout />);
  await act(async () => {});
  expect(mockSessionRead).not.toHaveBeenCalled();
  await act(async () => {
    rejectBootstrap(new Error('SETUP_FAILED'));
  });
  expect(mockSessionRead).not.toHaveBeenCalled();
  view.unmount();
});
