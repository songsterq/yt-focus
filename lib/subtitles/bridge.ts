import type { CaptionTrack } from './types';
import type { TimedTextContext } from './timedtext-url';

type Pending = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

let nextId = 0;
const pending = new Map<number, Pending>();
let installed = false;

function ensureInstalled() {
  if (installed) return;
  installed = true;
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const msg = event.data as
      | { source?: string; id?: number; ok?: boolean; result?: unknown }
      | undefined;
    if (!msg || msg.source !== 'yt-focus-res') return;
    const id = msg.id;
    if (typeof id !== 'number') return;
    const cb = pending.get(id);
    if (!cb) return;
    pending.delete(id);
    if (msg.ok) cb.resolve(msg.result);
    else cb.reject(new Error(String(msg.result ?? 'bridge error')));
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
