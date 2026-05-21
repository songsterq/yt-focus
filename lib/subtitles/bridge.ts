import type { CaptionTrack } from './types';
import type { TimedTextContext } from './timedtext-url';

type Pending = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

type EventCb = (value: unknown) => void;

let nextId = 0;
const pending = new Map<number, Pending>();
const eventSubscribers = new Map<string, Set<EventCb>>();
let installed = false;

function ensureInstalled() {
  if (installed) return;
  installed = true;
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const msg = event.data as
      | {
          source?: string;
          id?: number;
          ok?: boolean;
          result?: unknown;
          kind?: string;
          value?: unknown;
        }
      | undefined;
    if (!msg) return;
    if (msg.source === 'yt-focus-res') {
      const id = msg.id;
      if (typeof id !== 'number') return;
      const cb = pending.get(id);
      if (!cb) return;
      pending.delete(id);
      if (msg.ok) cb.resolve(msg.result);
      else cb.reject(new Error(String(msg.result ?? 'bridge error')));
      return;
    }
    if (msg.source === 'yt-focus-event' && typeof msg.kind === 'string') {
      const subs = eventSubscribers.get(msg.kind);
      if (!subs) return;
      for (const cb of subs) {
        try {
          cb(msg.value);
        } catch {
          // swallow subscriber errors so one bad handler doesn't break others
        }
      }
    }
  });
}

function call<T>(action: string, payload?: unknown, timeoutMs = 2000): Promise<T> {
  ensureInstalled();
  return new Promise<T>((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject,
    });
    window.postMessage(
      { source: 'yt-focus-req', id, action, payload },
      '*',
    );
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`bridge timeout: ${action}`));
      }
    }, timeoutMs);
  });
}

export function bridgeGetTracks(): Promise<CaptionTrack[]> {
  return call<CaptionTrack[]>('getTracks');
}

export function bridgeGetVideoId(): Promise<string | null> {
  return call<string | null>('getVideoId');
}

export function bridgeGetTimedTextContext(): Promise<TimedTextContext | null> {
  return call<TimedTextContext | null>('getTimedTextContext');
}

export function bridgeFetchText(url: string): Promise<string> {
  // Longer timeout; some videos with very large transcripts can take a few
  // seconds to assemble.
  return call<string>('fetchText', url, 15000);
}

export function bridgeGetDisplayedLang(): Promise<string | null> {
  return call<string | null>('getDisplayedLang');
}

export function subscribeBridgeEvent<T>(
  kind: string,
  cb: (value: T) => void,
): () => void {
  ensureInstalled();
  let set = eventSubscribers.get(kind);
  if (!set) {
    set = new Set();
    eventSubscribers.set(kind, set);
  }
  const wrapped: EventCb = (v) => cb(v as T);
  set.add(wrapped);
  return () => {
    set!.delete(wrapped);
    if (set!.size === 0) eventSubscribers.delete(kind);
  };
}
