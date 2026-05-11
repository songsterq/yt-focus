import { storage } from '#imports';

const defaultSecondaryLang = (() => {
  try {
    return chrome.i18n.getUILanguage().split('-')[0] || 'en';
  } catch {
    return 'en';
  }
})();

export const hideShortsPref = storage.defineItem<boolean>('sync:hideShorts', {
  fallback: true,
});

export const hidePlayablesPref = storage.defineItem<boolean>('sync:hidePlayables', {
  fallback: true,
});

export const dualSubtitlesEnabledPref = storage.defineItem<boolean>(
  'sync:dualSubtitlesEnabled',
  { fallback: true },
);

export const secondaryLanguagePref = storage.defineItem<string>(
  'sync:secondaryLanguage',
  { fallback: defaultSecondaryLang },
);

export type Preferences = {
  hideShorts: boolean;
  hidePlayables: boolean;
  dualSubtitlesEnabled: boolean;
  secondaryLanguage: string;
};

export async function getPreferences(): Promise<Preferences> {
  const [hideShorts, hidePlayables, dualSubtitlesEnabled, secondaryLanguage] =
    await Promise.all([
      hideShortsPref.getValue(),
      hidePlayablesPref.getValue(),
      dualSubtitlesEnabledPref.getValue(),
      secondaryLanguagePref.getValue(),
    ]);
  return {
    hideShorts,
    hidePlayables,
    dualSubtitlesEnabled,
    secondaryLanguage,
  };
}

export function watchPreferences(
  cb: (prefs: Preferences) => void,
): () => void {
  // If multiple prefs change in one storage event, cb fires multiple times with
  // the same final snapshot. Consumers must be idempotent.
  const refresh = () => {
    void getPreferences().then(cb);
  };
  const u1 = hideShortsPref.watch(refresh);
  const u2 = hidePlayablesPref.watch(refresh);
  const u3 = dualSubtitlesEnabledPref.watch(refresh);
  const u4 = secondaryLanguagePref.watch(refresh);
  return () => {
    u1();
    u2();
    u3();
    u4();
  };
}
