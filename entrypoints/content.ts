import { defineContentScript } from '#imports';
import { applyHiding } from '@/lib/hide-content';
import { createHiddenCounter } from '@/lib/hidden-counter';
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

    const counter = createHiddenCounter();

    const runHide = () => {
      const { shortsShelves, playablesShelves } = applyHiding(prefs);
      counter.recordHidden('shorts', shortsShelves);
      counter.recordHidden('playables', playablesShelves);
    };

    runHide();

    const dual = startDualSubtitles(ctx, prefs);

    const unwatch = watchPreferences((next) => {
      prefs = next;
      runHide();
      dual.updatePrefs(prefs);
    });
    ctx.onInvalidated(unwatch);

    const observer = new MutationObserver(runHide);
    observer.observe(document.body, { childList: true, subtree: true });
    ctx.onInvalidated(() => observer.disconnect());

    const flushOnHide = () => {
      void counter.flush();
    };
    addEventListener('pagehide', flushOnHide);
    const onVisChange = () => {
      if (document.visibilityState === 'hidden') flushOnHide();
    };
    document.addEventListener('visibilitychange', onVisChange);
    ctx.onInvalidated(() => {
      removeEventListener('pagehide', flushOnHide);
      document.removeEventListener('visibilitychange', onVisChange);
      void counter.flush();
    });
  },
});
