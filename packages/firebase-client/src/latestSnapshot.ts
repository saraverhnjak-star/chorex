export interface LatestSnapshotCoordinator<TSnapshot> {
  push(snapshot: TSnapshot): void;
  fail(error: unknown): void;
  stop(): void;
}

export function createLatestSnapshotCoordinator<TSnapshot, TValue>(
  resolve: (snapshot: TSnapshot) => Promise<TValue>,
  onValue: (value: TValue) => void,
  onError: (error: unknown) => void,
): LatestSnapshotCoordinator<TSnapshot> {
  let active = true;
  let version = 0;

  return {
    push(snapshot) {
      const snapshotVersion = ++version;
      void resolve(snapshot).then(
        (value) => {
          if (active && snapshotVersion === version) onValue(value);
        },
        (error: unknown) => {
          if (active && snapshotVersion === version) onError(error);
        },
      );
    },
    fail(error) {
      version += 1;
      if (active) onError(error);
    },
    stop() {
      active = false;
      version += 1;
    },
  };
}
