import { createLatestSnapshotCoordinator } from '../../../packages/firebase-client/src/latestSnapshot';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

it('ignores an older async result after a newer snapshot resolves', async () => {
  const first = deferred<string>();
  const second = deferred<string>();
  const values: string[] = [];
  const errors: unknown[] = [];
  const coordinator = createLatestSnapshotCoordinator(
    (snapshot: 'first' | 'second') =>
      snapshot === 'first' ? first.promise : second.promise,
    (value) => values.push(value),
    (error) => errors.push(error),
  );

  coordinator.push('first');
  coordinator.push('second');
  second.resolve('newest');
  await second.promise;
  await Promise.resolve();
  first.resolve('stale');
  await first.promise;
  await Promise.resolve();

  expect(values).toEqual(['newest']);
  expect(errors).toEqual([]);
});

it('reports only the latest malformed result and stops after cleanup', async () => {
  const stale = deferred<string>();
  const malformed = deferred<string>();
  const afterCleanup = deferred<string>();
  const values: string[] = [];
  const errors: unknown[] = [];
  const coordinator = createLatestSnapshotCoordinator(
    (snapshot: 'stale' | 'malformed' | 'after-cleanup') => {
      if (snapshot === 'stale') return stale.promise;
      if (snapshot === 'malformed') return malformed.promise;
      return afterCleanup.promise;
    },
    (value) => values.push(value),
    (error) => errors.push(error),
  );

  coordinator.push('stale');
  coordinator.push('malformed');
  stale.reject(new Error('stale failure'));
  await stale.promise.catch(() => undefined);
  malformed.reject(new Error('malformed current revision'));
  await malformed.promise.catch(() => undefined);
  await Promise.resolve();

  expect(errors).toHaveLength(1);
  expect((errors[0] as Error).message).toBe('malformed current revision');

  coordinator.push('after-cleanup');
  coordinator.stop();
  afterCleanup.resolve('ignored');
  await afterCleanup.promise;
  await Promise.resolve();

  expect(values).toEqual([]);
  expect(errors).toHaveLength(1);
});
