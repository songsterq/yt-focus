import { defineContentScript } from '#imports';
import { applyHiding } from '@/lib/hide-content';
import {
  getPreferences,
  watchPreferences,
  type Preferences,
} from '@/lib/preferences';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  async main(ctx) {
    let prefs: Preferences = await getPreferences();
    applyHiding(prefs);

    const unwatch = watchPreferences((next) => {
      prefs = next;
      applyHiding(prefs);
    });
    ctx.onInvalidated(unwatch);

    const observer = new MutationObserver(() => applyHiding(prefs));
    observer.observe(document.body, { childList: true, subtree: true });
    ctx.onInvalidated(() => observer.disconnect());
  },
});
