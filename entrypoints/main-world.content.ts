import { defineContentScript } from '#imports';
import {
  displayedLangFromUrl,
  timedTextContextFromUrl,
} from '@/lib/subtitles/timedtext-url';

type Request = {
  source: 'yt-focus-req';
  id: number;
  action: string;
};

type TimedTextContext = {
  poToken?: string;
  clientName?: string;
  clientVersion?: string;
  browserName?: string;
  browserVersion?: string;
  osName?: string;
  osVersion?: string;
  platform?: string;
};

type TimedTextState = {
  context: TimedTextContext | null;
  displayedLang: string | null;
  installed: boolean;
};

const timedTextState = ((window as any).__ytFocusTimedTextState ??= {
  context: null,
  displayedLang: null,
  installed: false,
}) as TimedTextState;

function reply(id: number, ok: boolean, result: unknown) {
  window.postMessage({ source: 'yt-focus-res', id, ok, result }, '*');
}

function getInitialPlayerResponse(): any {
  // Preferred: ask the player element directly. Unlike window.ytInitialPlayerResponse
  // (which YouTube sets once on initial load and never clears), this reflects the
  // currently loaded video, including after SPA navigations.
  const player = document.querySelector('#movie_player') as
    | (HTMLElement & { getPlayerResponse?: () => any })
    | null;
  if (player?.getPlayerResponse) {
    try {
      const r = player.getPlayerResponse();
      if (r && r.videoDetails?.videoId) return r;
    } catch {
      // fall through to globals
    }
  }
  // Fallback for the early page lifecycle, before the player element is ready.
  const w = window as any;
  const initial = w.ytInitialPlayerResponse;
  if (initial) return initial;
  const raw = w.ytplayer?.config?.args?.raw_player_response;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw ?? null;
}

function getTracks() {
  const r = getInitialPlayerResponse();
  return r?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
}

function getVideoId() {
  const r = getInitialPlayerResponse();
  return r?.videoDetails?.videoId ?? null;
}

function rememberTimedTextContext(body: unknown) {
  if (typeof body !== 'string') return;
  try {
    const data = JSON.parse(body) as {
      serviceIntegrityDimensions?: { poToken?: string };
      context?: {
        client?: {
          clientName?: string;
          clientVersion?: string;
          browserName?: string;
          browserVersion?: string;
          osName?: string;
          osVersion?: string;
          platform?: string;
        };
      };
    };
    const poToken = data.serviceIntegrityDimensions?.poToken;
    if (!poToken) return;
    const client = data.context?.client ?? {};
    timedTextState.context = {
      poToken,
      clientName: client.clientName,
      clientVersion: client.clientVersion,
      browserName: client.browserName,
      browserVersion: client.browserVersion,
      osName: client.osName,
      osVersion: client.osVersion,
      platform: client.platform,
    };
  } catch {
    // Ignore non-JSON player requests.
  }
}

function rememberTimedTextContextFromUrl(url: string) {
  const context = timedTextContextFromUrl(url);
  if (!context) return;
  timedTextState.context = {
    ...timedTextState.context,
    ...context,
  };
}

// URLs the extension has fetched itself, so the patched fetch can skip them
// when tracking what YouTube is displaying. Without this, our own secondary
// subtitle fetch would set displayedLang to our own track's language and
// cause the picker to revert to off.
const ownFetchUrls = new Set<string>();

function rememberDisplayedLangFromUrl(url: string) {
  if (ownFetchUrls.has(url)) return;
  const lang = displayedLangFromUrl(url);
  if (!lang) return;
  if (lang === timedTextState.displayedLang) return;
  timedTextState.displayedLang = lang;
  window.postMessage(
    { source: 'yt-focus-event', kind: 'displayedLang', value: lang },
    '*',
  );
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function watchPlayerRequests() {
  if (timedTextState.installed) return;
  timedTextState.installed = true;

  const originalFetch = window.fetch;
  window.fetch = function patchedFetch(input, init) {
    const url = requestUrl(input);
    rememberTimedTextContextFromUrl(url);
    rememberDisplayedLangFromUrl(url);
    if (url.includes('/youtubei/v1/player')) {
      if (typeof init?.body === 'string') {
        rememberTimedTextContext(init.body);
      } else if (input instanceof Request) {
        void input
          .clone()
          .text()
          .then(rememberTimedTextContext)
          .catch(() => {});
      }
    }
    return originalFetch.apply(this, arguments as unknown as Parameters<typeof fetch>);
  };

  const xhrUrls = new WeakMap<XMLHttpRequest, string>();
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function patchedOpen(
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ) {
    const urlString = String(url);
    xhrUrls.set(this, urlString);
    rememberTimedTextContextFromUrl(urlString);
    rememberDisplayedLangFromUrl(urlString);
    return originalOpen.call(
      this,
      method,
      url,
      async ?? true,
      username ?? null,
      password ?? null,
    );
  };
  XMLHttpRequest.prototype.send = function patchedSend(body?: Document | XMLHttpRequestBodyInit | null) {
    const url = xhrUrls.get(this);
    if (url?.includes('/youtubei/v1/player')) {
      rememberTimedTextContext(body);
    }
    return originalSend.call(this, body ?? null);
  };
}

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    watchPlayerRequests();
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      const msg = event.data as Request | undefined;
      if (!msg || msg.source !== 'yt-focus-req') return;

      try {
        switch (msg.action) {
          case 'getTracks':
            reply(msg.id, true, getTracks());
            return;
          case 'getVideoId':
            reply(msg.id, true, getVideoId());
            return;
          case 'getTimedTextContext':
            reply(msg.id, true, timedTextState.context);
            return;
          case 'getDisplayedLang':
            reply(msg.id, true, timedTextState.displayedLang);
            return;
          case 'fetchText': {
            // Run the network request from the page's main world so that
            // headers (Sec-Fetch-*, client-version sniffs, etc.) match what
            // YT's own player sends. Content-script fetches from the isolated
            // world have been observed to return 200/empty for timedtext URLs.
            const url = (msg as { payload?: unknown }).payload as string;
            ownFetchUrls.add(url);
            fetch(url, { credentials: 'include' })
              .then(async (res) => {
                if (!res.ok) {
                  const body = await res.text().catch(() => '');
                  reply(
                    msg.id,
                    false,
                    `HTTP ${res.status}: ${body.slice(0, 120)}`,
                  );
                  return;
                }
                const body = await res.text();
                reply(msg.id, true, body);
              })
              .catch((err) => reply(msg.id, false, String(err)))
              .finally(() => ownFetchUrls.delete(url));
            return;
          }
          default:
            reply(msg.id, false, 'unknown action');
        }
      } catch (err) {
        reply(msg.id, false, String(err));
      }
    });
  },
});
