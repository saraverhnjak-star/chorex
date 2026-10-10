import { createSharedObserver } from '../../../packages/firebase-client/src/sharedObserver';

it('shares one listener and replays its snapshot until the final consumer leaves', () => {
  const observer = createSharedObserver<number, Error>();
  let emit: ((value: number) => void) | undefined;
  const stop = jest.fn();
  const start = jest.fn((value: (value: number) => void) => {
    emit = value;
    return stop;
  });
  const first = jest.fn(),
    second = jest.fn();
  const leaveFirst = observer.subscribe(
    'user:contract',
    start,
    first,
    jest.fn(),
  );
  emit?.(3);
  const leaveSecond = observer.subscribe(
    'user:contract',
    start,
    second,
    jest.fn(),
  );
  expect(start).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledWith(3);
  leaveFirst();
  expect(stop).not.toHaveBeenCalled();
  emit?.(4);
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenLastCalledWith(4);
  leaveSecond();
  expect(stop).toHaveBeenCalledTimes(1);
  observer.subscribe('user:contract', start, jest.fn(), jest.fn());
  expect(start).toHaveBeenCalledTimes(2);
  observer.clear();
});

it('keeps account scopes separate and releases snapshots on account cleanup', () => {
  const observer = createSharedObserver<number, Error>();
  const stop = jest.fn();
  const start = jest.fn((value: (value: number) => void) => {
    value(1);
    return stop;
  });
  observer.subscribe('alice:contract', start, jest.fn(), jest.fn());
  observer.subscribe('bob:contract', start, jest.fn(), jest.fn());
  expect(start).toHaveBeenCalledTimes(2);
  observer.clear();
  expect(stop).toHaveBeenCalledTimes(2);
  observer.subscribe('alice:contract', start, jest.fn(), jest.fn());
  expect(start).toHaveBeenCalledTimes(3);
  observer.clear();
});
