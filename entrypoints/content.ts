import { defineContentScript } from '#imports';
import { applyHiding } from '@/lib/hide-content';
import {
  getPreferences,
  watchPreferences,
  type Preferences,
} from '@/lib/preferences';
import { startDualSubtitles } from '@/lib/subtitles/controller';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  async main(ctx) {
    let prefs: Preferences = await getPreferences();
    console.log('[yt-focus][content] loaded', prefs);
    applyHiding(prefs);

    const dual = startDualSubtitles(ctx, prefs);

    const unwatch = watchPreferences((next) => {
      prefs = next;
      applyHiding(prefs);
      dual.updatePrefs(prefs);
    });
    ctx.onInvalidated(unwatch);

    const observer = new MutationObserver(() => applyHiding(prefs));
    observer.observe(document.body, { childList: true, subtree: true });
    ctx.onInvalidated(() => observer.disconnect());
  },
});
