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
  return {
    hideShorts: await hideShortsPref.getValue(),
    hidePlayables: await hidePlayablesPref.getValue(),
  };
}

export function watchPreferences(
  cb: (prefs: Preferences) => void,
): () => void {
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
