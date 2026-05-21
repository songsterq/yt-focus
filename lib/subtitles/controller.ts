import * as sel from '../selectors';
import type { Preferences } from '../preferences';
import { bridgeGetDisplayedLang, subscribeBridgeEvent } from './bridge';
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
  sourceTrack: CaptionTrack | null,
  effectivePrimaryLang: string | null,
  secondaryLang: string,
): SecondarySelection {
  if (tracks.length === 0 || !sourceTrack) return { type: 'off' };
  // effectivePrimaryLang reflects what YT is actually showing (tlang || lang
  // from the most recent /api/timedtext URL), not just the source track's
  // language. When unknown (no caption fetch observed yet), fall back to the
  // source language.
  const effective = effectivePrimaryLang ?? sourceTrack.languageCode;
  if (effective === secondaryLang) return { type: 'off' };
  // Prefer a native track in the secondary language, even when it is the
  // source track itself (e.g. YT is auto-translating English source to
  // Japanese; user wants English secondary — that's the source track, and
  // its menu label is the clean "English" rather than "Auto-translate → English").
  const native = tracks.find((t) => t.languageCode === secondaryLang);
  if (native) return { type: 'native', track: native };
  return {
    type: 'translate',
    sourceTrack,
    targetLang: secondaryLang,
  };
}

function sameSelection(a: SecondarySelection, b: SecondarySelection): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'off') return true;
  if (a.type === 'native' && b.type === 'native') {
    return a.track.vssId === b.track.vssId;
  }
  if (a.type === 'translate' && b.type === 'translate') {
    return (
      a.sourceTrack.vssId === b.sourceTrack.vssId &&
      a.targetLang === b.targetLang
    );
  }
  return false;
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
  let captionState: { ccOn: boolean; displayedLang: string | null } = {
    ccOn: false,
    displayedLang: null,
  };

  let overlay: OverlayHandle | null = null;
  let sync: SyncHandle | null = null;
  let menu: MenuHandle | null = null;
  let fetchCtl: AbortController | null = null;
  let ccObserver: MutationObserver | null = null;
  let unsubDisplayedLang: (() => void) | null = null;
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
    ccObserver?.disconnect();
    ccObserver = null;
    unsubDisplayedLang?.();
    unsubDisplayedLang = null;
    tracks = [];
    primary = null;
    secondary = { type: 'off' };
    secondaryUserOverride = false;
    captionState = { ccOn: false, displayedLang: null };
    activeSetupKey = null;
  };

  const visibilityRule = () =>
    captionState.ccOn && secondary.type !== 'off';

  const reevaluate = () => {
    if (!overlay) return;
    if (secondaryUserOverride) {
      overlay.setVisible(visibilityRule());
      return;
    }
    const next = pickDefaultSecondary(
      tracks,
      primary,
      captionState.displayedLang,
      prefs.secondaryLanguage,
    );
    const changed = !sameSelection(next, secondary);
    secondary = next;
    if (changed) void startSecondary();
    overlay.setVisible(visibilityRule());
  };

  const readDisplayedLang = async (): Promise<string | null> => {
    try {
      return await bridgeGetDisplayedLang();
    } catch (err) {
      console.warn('[yt-focus] bridgeGetDisplayedLang failed', err);
      return null;
    }
  };

  const startSecondary = async () => {
    fetchCtl?.abort();
    if (secondary.type === 'off') {
      sync?.stop();
      sync = null;
      overlay?.setText('');
      overlay?.setVisible(visibilityRule());
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
        cues = await fetchCues(primary, {
          translateTo: secondary.track.languageCode,
          signal: ctl.signal,
        });
      }
      if (ctl.signal.aborted) return;
      const video = document.querySelector<HTMLVideoElement>(sel.VIDEO_ELEMENT);
      if (!video) {
        console.warn('[yt-focus] startSecondary aborted: no <video>');
        return;
      }
      if (sync) {
        sync.setCues(cues);
      } else if (overlay) {
        sync = startSync(video, cues, (text) => {
          overlay?.setText(text);
        });
      } else {
        console.warn(
          '[yt-focus] startSecondary aborted: no overlay (this is a bug)',
        );
      }
      overlay?.setVisible(visibilityRule());
    } catch (err) {
      if (!ctl.signal.aborted) {
        console.warn('[yt-focus] secondary fetch failed', err);
      }
    }
  };

  const setupForCurrentPage = async () => {
    if (stopped || !prefs.dualSubtitlesEnabled) return;
    if (!WATCH_PATH.test(location.pathname)) return;

    const setupId = ++setupSeq;
    const player = document.querySelector<HTMLElement>(sel.MOVIE_PLAYER);
    if (!player) return;

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
    if (activeSetupKey === setupKey) return;

    tearDown();
    activeSetupKey = setupKey;
    tracks = result.tracks;
    if (tracks.length === 0) return;

    primary = pickDefaultPrimary(tracks);

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

    // Subscribe BEFORE the bridge read so we don't miss a value that arrives
    // between the read and the subscription.
    unsubDisplayedLang = subscribeBridgeEvent<string | null>(
      'displayedLang',
      (lang) => {
        if (lang === captionState.displayedLang) return;
        captionState.displayedLang = lang;
        reevaluate();
      },
    );
    const initialLang = await readDisplayedLang();
    if (stopped || setupId !== setupSeq) return;
    // Only use the bridge snapshot if a push hasn't already given us a value;
    // pushes that arrive during the await are fresher than the snapshot.
    if (captionState.displayedLang == null) {
      captionState.displayedLang = initialLang;
    }

    const ccButton = document.querySelector<HTMLElement>(sel.CC_BUTTON);
    if (ccButton) {
      captionState.ccOn = ccButton.getAttribute('aria-pressed') === 'true';
      ccObserver = new MutationObserver(() => {
        const next = ccButton.getAttribute('aria-pressed') === 'true';
        if (next === captionState.ccOn) return;
        captionState.ccOn = next;
        reevaluate();
      });
      ccObserver.observe(ccButton, {
        attributes: true,
        attributeFilter: ['aria-pressed'],
      });
    }

    reevaluate();
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
      prefs = next;
      if (!wasEnabled && next.dualSubtitlesEnabled) {
        void setupForCurrentPage();
      } else if (wasEnabled && !next.dualSubtitlesEnabled) {
        tearDown();
      } else if (next.dualSubtitlesEnabled) {
        reevaluate();
      }
    },
  };
}
