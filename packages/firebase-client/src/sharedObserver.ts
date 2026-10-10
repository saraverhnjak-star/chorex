// Share active listeners only. The final consumer releases both listener and snapshot.
export function createSharedObserver<T, E>() {
  const entries = new Map<
    string,
    {
      listeners: Set<{ value: (value: T) => void; error: (error: E) => void }>;
      snapshot?: T;
      failure?: E;
      stop?: () => void;
    }
  >();
  return {
    subscribe(
      key: string,
      start: (
        value: (value: T) => void,
        error: (error: E) => void,
      ) => () => void,
      value: (value: T) => void,
      error: (error: E) => void,
    ) {
      let entry = entries.get(key);
      const listener = { value, error };
      if (!entry) {
        entry = { listeners: new Set([listener]) };
        entries.set(key, entry);
        const current = entry;
        try {
          current.stop = start(
            (snapshot) => {
              current.snapshot = snapshot;
              current.failure = undefined;
              for (const item of [...current.listeners]) item.value(snapshot);
            },
            (failure) => {
              current.failure = failure;
              current.snapshot = undefined;
              for (const item of [...current.listeners]) item.error(failure);
            },
          );
        } catch (failure) {
          entries.delete(key);
          throw failure;
        }
      } else {
        entry.listeners.add(listener);
        if (entry.failure !== undefined) error(entry.failure);
        else if (entry.snapshot !== undefined) value(entry.snapshot);
      }
      const current = entry;
      return () => {
        current.listeners.delete(listener);
        if (!current.listeners.size && entries.get(key) === current) {
          entries.delete(key);
          current.stop?.();
        }
      };
    },
    clear() {
      for (const entry of entries.values()) {
        entry.listeners.clear();
        entry.stop?.();
      }
      entries.clear();
    },
  };
}
