import * as sel from '../selectors';
import type { Preferences } from '../preferences';
import { discoverTracks } from './discover';
import { fetchCues } from './fetch';
import { startSync, type SyncHandle } from './sync';
import { mountOverlay, type OverlayHandle } from './overlay';
import { injectMenu, type MenuHandle } from './menu';
import type { CaptionTrack, SecondarySelection } from './types';

type Ctx = { onInvalidated(cb: () => void): void };

export type DualController = { stop(): void; updatePrefs(p: Preferences): void };

const WATCH_PATH = /^\/watch/;

function pickDefaultPrimary(tracks: CaptionTrack[]): CaptionTrack | null {
  return tracks[0] ?? null;
}

function pickDefaultSecondary(
  tracks: CaptionTrack[],
  primary: CaptionTrack | null,
  secondaryLang: string,
): SecondarySelection {
  if (tracks.length === 0 || !primary) return { type: 'off' };
  // If there's a native track in the secondary language that's not the
  // primary, prefer it (avoids machine translation when avoidable).
  const native = tracks.find(
    (t) => t.languageCode === secondaryLang && t.vssId !== primary.vssId,
  );
  if (native) return { type: 'native', track: native };
  // Otherwise translate the primary track to the secondary language.
  if (primary.languageCode === secondaryLang) {
    // Same language as primary; nothing useful to add.
    return { type: 'off' };
  }
  return {
    type: 'translate',
    sourceTrack: primary,
    targetLang: secondaryLang,
  };
}

export function startDualSubtitles(
  ctx: Ctx,
  initialPrefs: Preferences,
): DualController {
  let prefs = initialPrefs;
  let stopped = false;

  // Per-page session state. Cleared on every navigate.
  let tracks: CaptionTrack[] = [];
  let primary: CaptionTrack | null = null;
  let secondary: SecondarySelection = { type: 'off' };
  let secondaryUserOverride = false;

  let overlay: OverlayHandle | null = null;
  let sync: SyncHandle | null = null;
  let menu: MenuHandle | null = null;
  let fetchCtl: AbortController | null = null;
  let activeSetupKey: string | null = null;
  let setupSeq = 0;

  const tearDown = () => {
    fetchCtl?.abort();
    fetchCtl = null;
    sync?.stop();
    sync = null;
    overlay?.destroy();
    overlay = null;
    menu?.stop();
    menu = null;
    tracks = [];
    primary = null;
    secondary = { type: 'off' };
    secondaryUserOverride = false;
    activeSetupKey = null;
  };

  const updateOverlayVisibility = () => {
    if (!overlay) return;
    overlay.setVisible(secondary.type !== 'off');
  };

  const startSecondary = async () => {
    fetchCtl?.abort();
    console.log('[yt-focus] startSecondary', secondary);
    if (secondary.type === 'off') {
      sync?.stop();
      sync = null;
      overlay?.setText('');
      updateOverlayVisibility();
      return;
    }
    const ctl = new AbortController();
    fetchCtl = ctl;
    try {
      let cues =
        secondary.type === 'native'
          ? await fetchCues(secondary.track, { signal: ctl.signal })
          : await fetchCues(secondary.sourceTrack, {
              translateTo: secondary.targetLang,
              signal: ctl.signal,
            });
      // Many tracks listed in playerCaptionsTracklistRenderer.captionTracks
      // are translation-only stubs whose own baseUrls return empty. If a
      // native fetch returns nothing and we have a real primary track,
      // retry as a tlang= translation of the primary.
      if (
        cues.length === 0 &&
        secondary.type === 'native' &&
        primary &&
        primary.vssId !== secondary.track.vssId
      ) {
        console.log(
          '[yt-focus] native track yielded 0 cues; retrying as translate from primary',
        );
        cues = await fetchCues(primary, {
          translateTo: secondary.track.languageCode,
          signal: ctl.signal,
        });
      }
      if (ctl.signal.aborted) return;
      console.log('[yt-focus] cues loaded', {
        count: cues.length,
        first: cues[0],
        last: cues[cues.length - 1],
      });
      const video = document.querySelector<HTMLVideoElement>(sel.VIDEO_ELEMENT);
      if (!video) {
        console.warn('[yt-focus] startSecondary aborted: no <video>');
        return;
      }
      if (sync) {
        sync.setCues(cues);
      } else if (overlay) {
        let firstActive = true;
        sync = startSync(video, cues, (text) => {
          if (firstActive && text) {
            firstActive = false;
            console.log('[yt-focus] first active cue', text);
          }
          overlay?.setText(text);
          updateOverlayVisibility();
        });
      } else {
        console.warn(
          '[yt-focus] startSecondary aborted: no overlay (this is a bug)',
        );
      }
    } catch (err) {
      if (!ctl.signal.aborted) {
        console.warn('[yt-focus] secondary fetch failed', err);
      }
    }
  };

  const setupForCurrentPage = async () => {
    if (stopped || !prefs.dualSubtitlesEnabled) {
      console.log('[yt-focus] setup skipped', {
        stopped,
        enabled: prefs.dualSubtitlesEnabled,
      });
      return;
    }
    if (!WATCH_PATH.test(location.pathname)) {
      console.log('[yt-focus] setup skipped: not /watch', location.pathname);
      return;
    }

    const setupId = ++setupSeq;
    const player = document.querySelector<HTMLElement>(sel.MOVIE_PLAYER);
    if (!player) {
      console.log('[yt-focus] setup skipped: no #movie_player');
      return;
    }

    // If the URL videoId differs from the one we last set up for, the previous
    // session is stale — clear it now so the user doesn't see old cues during
    // the discovery retry window. Discovery still runs below to set up the
    // new video.
    const urlVideoId = new URL(location.href).searchParams.get('v');
    const activeVideoId = activeSetupKey?.split(':')[0] ?? null;
    if (activeVideoId && urlVideoId && urlVideoId !== activeVideoId) {
      tearDown();
    }

    const result = await discoverTracks();
    if (stopped || setupId !== setupSeq) return;
    const setupKey = `${result.videoId ?? new URL(location.href).searchParams.get('v') ?? location.href}:${prefs.secondaryLanguage}`;
    if (activeSetupKey === setupKey) {
      console.log('[yt-focus] setup skipped: already initialized', setupKey);
      return;
    }

    tearDown();
    activeSetupKey = setupKey;
    tracks = result.tracks;
    console.log('[yt-focus] tracks discovered', {
      videoId: result.videoId,
      count: tracks.length,
      tracks,
    });
    if (tracks.length === 0) return;

    primary = pickDefaultPrimary(tracks);
    secondary = pickDefaultSecondary(tracks, primary, prefs.secondaryLanguage);
    console.log('[yt-focus] initial state', {
      primary,
      secondary,
      secondaryLang: prefs.secondaryLanguage,
    });

    overlay = mountOverlay(player);
    menu = injectMenu({
      getTracks: () => tracks,
      getPrimary: () => primary,
      getSecondary: () => secondary,
      setSecondary: (s) => {
        secondary = s;
        secondaryUserOverride = true;
        void startSecondary();
      },
    });
    void startSecondary();
  };

  // Listen for SPA navigation. yt-navigate-finish fires after each watch-page
  // change; ytInitialPlayerResponse may lag so discoverTracks retries.
  const onNav = () => {
    void setupForCurrentPage();
  };
  document.addEventListener('yt-navigate-finish', onNav as EventListener);

  // Initial run for the page we loaded into.
  void setupForCurrentPage();

  ctx.onInvalidated(() => {
    stopped = true;
    document.removeEventListener('yt-navigate-finish', onNav as EventListener);
    tearDown();
  });

  return {
    stop() {
      stopped = true;
      document.removeEventListener('yt-navigate-finish', onNav as EventListener);
      tearDown();
    },
    updatePrefs(next: Preferences) {
      const wasEnabled = prefs.dualSubtitlesEnabled;
      const oldLang = prefs.secondaryLanguage;
      prefs = next;
      if (!wasEnabled && next.dualSubtitlesEnabled) {
        void setupForCurrentPage();
      } else if (wasEnabled && !next.dualSubtitlesEnabled) {
        tearDown();
      } else if (
        next.dualSubtitlesEnabled &&
        oldLang !== next.secondaryLanguage &&
        !secondaryUserOverride
      ) {
        secondary = pickDefaultSecondary(tracks, primary, next.secondaryLanguage);
        void startSecondary();
      }
    },
  };
}
