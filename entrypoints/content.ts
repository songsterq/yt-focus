import { defineContentScript } from '#imports';
import { applyHiding } from '@/lib/hide-content';
import {
  getPreferences,
  watchPreferences,
  type Preferences,
} from '@/lib/preferences';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  async main() {
    let prefs: Preferences = await getPreferences();
    applyHiding(prefs);

    watchPreferences((next) => {
      prefs = next;
      applyHiding(prefs);
    });

    new MutationObserver(() => applyHiding(prefs)).observe(document.body, {
      childList: true,
      subtree: true,
    });
  },
});
