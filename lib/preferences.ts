import { storage } from '#imports';

export const hideShortsPref = storage.defineItem<boolean>('sync:hideShorts', {
  fallback: true,
});

export const hidePlayablesPref = storage.defineItem<boolean>('sync:hidePlayables', {
  fallback: true,
});

export type Preferences = {
  hideShorts: boolean;
  hidePlayables: boolean;
};

export async function getPreferences(): Promise<Preferences> {
  const [hideShorts, hidePlayables] = await Promise.all([
    hideShortsPref.getValue(),
    hidePlayablesPref.getValue(),
  ]);
  return { hideShorts, hidePlayables };
}

export function watchPreferences(
  cb: (prefs: Preferences) => void,
): () => void {
  // If both prefs change in one storage event, cb fires twice with the same
  // final snapshot. Consumers must be idempotent.
  const u1 = hideShortsPref.watch(() => {
    void getPreferences().then(cb);
  });
  const u2 = hidePlayablesPref.watch(() => {
    void getPreferences().then(cb);
  });
  return () => {
    u1();
    u2();
  };
}
