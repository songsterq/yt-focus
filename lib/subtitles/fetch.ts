import { bridgeFetchText, bridgeGetTimedTextContext } from './bridge';
import { buildTimedTextUrl, type TimedTextContext } from './timedtext-url';
import type { CaptionTrack, Cue } from './types';

type Json3Event = {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: Array<{ utf8?: string }>;
};
type Json3 = { events?: Json3Event[] };
type FetchAttempt =
  | { type: 'success'; body: string; cues: Cue[] }
  | { type: 'empty' }
  | { type: 'rate-limited' };

class TimedTextRateLimitError extends Error {
  constructor() {
    super('timedtext rate limited');
    this.name = 'TimedTextRateLimitError';
  }
}

async function fetchText(url: string, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw new Error('aborted');
  const body = await bridgeFetchText(url);
  if (signal?.aborted) throw new Error('aborted');
  return body;
}

function isRateLimitedError(err: unknown): boolean {
  return err instanceof Error && /^HTTP 429\b/.test(err.message);
}

function parseJson3(json: Json3): Cue[] {
  const cues: Cue[] = [];
  for (const e of json.events ?? []) {
    const start = e.tStartMs;
    const dur = e.dDurationMs;
    const segs = e.segs;
    if (typeof start !== 'number' || !segs) continue;
    let text = '';
    for (const s of segs) if (typeof s.utf8 === 'string') text += s.utf8;
    text = text.replace(/\n/g, ' ').trim();
    if (!text) continue;
    cues.push({
      startMs: start,
      endMs: start + (typeof dur === 'number' ? dur : 2000),
      text,
    });
  }
  cues.sort((a, b) => a.startMs - b.startMs);
  return cues;
}

function parseXml(text: string): Cue[] {
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  if (doc.querySelector('parsererror')) return [];
  const cues: Cue[] = [];
  const decoder = document.createElement('textarea');

  // Legacy YT transcript format: <transcript><text start="s" dur="s">html</text>...
  const texts = doc.querySelectorAll('text');
  for (const t of texts) {
    const start = parseFloat(t.getAttribute('start') ?? '');
    const dur = parseFloat(t.getAttribute('dur') ?? '0');
    if (isNaN(start)) continue;
    decoder.innerHTML = t.textContent ?? '';
    const decoded = decoder.value.replace(/\n/g, ' ').trim();
    if (!decoded) continue;
    cues.push({
      startMs: Math.round(start * 1000),
      endMs: Math.round((start + dur) * 1000),
      text: decoded,
    });
  }
  if (cues.length > 0) return cues.sort((a, b) => a.startMs - b.startMs);

  // srv3 format: <timedtext><body><p t="ms" d="ms">[<s>]text[</s>]</p>...
  const ps = doc.querySelectorAll('body p, p');
  for (const p of ps) {
    const tAttr = p.getAttribute('t');
    const dAttr = p.getAttribute('d');
    if (tAttr === null) continue;
    const t = parseInt(tAttr, 10);
    const d = dAttr !== null ? parseInt(dAttr, 10) : 0;
    if (isNaN(t)) continue;
    // <p> may contain plain text or <s> word-segment children.
    let text = '';
    for (const node of Array.from(p.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.nodeValue ?? '';
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        text += (node as Element).textContent ?? '';
      }
    }
    decoder.innerHTML = text;
    const decoded = decoder.value.replace(/\n/g, ' ').trim();
    if (!decoded) continue;
    cues.push({ startMs: t, endMs: t + d, text: decoded });
  }
  cues.sort((a, b) => a.startMs - b.startMs);
  return cues;
}

async function tryFormat(
  track: CaptionTrack,
  fmt: string | null,
  opts?: {
    translateTo?: string;
    timedTextContext?: TimedTextContext | null;
    signal?: AbortSignal;
  },
): Promise<FetchAttempt> {
  const url = buildTimedTextUrl(track, fmt, {
    translateTo: opts?.translateTo,
    timedTextContext: opts?.timedTextContext,
  });
  let body: string;
  try {
    body = await fetchText(url, opts?.signal);
  } catch (err) {
    console.warn('[yt-focus] fetch threw', { fmt, err });
    return isRateLimitedError(err) ? { type: 'rate-limited' } : { type: 'empty' };
  }
  if (!body) return { type: 'empty' };
  let cues: Cue[] = [];
  if (fmt === 'json3') {
    try {
      cues = parseJson3(JSON.parse(body) as Json3);
    } catch (err) {
      console.warn('[yt-focus] json3 parse failed', err);
    }
  } else {
    cues = parseXml(body);
  }
  return { type: 'success', body, cues };
}

async function getTimedTextContext(
  track: CaptionTrack,
  signal?: AbortSignal,
): Promise<TimedTextContext | null> {
  const needsProofOfOrigin = track.baseUrl.includes('exp=xpe');
  const attempts = needsProofOfOrigin ? 15 : 1;
  for (let i = 0; i < attempts; i++) {
    if (signal?.aborted) throw new Error('aborted');
    const context = await bridgeGetTimedTextContext().catch(() => null);
    if (context?.poToken || i === attempts - 1) return context;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

export async function fetchCues(
  track: CaptionTrack,
  opts?: { translateTo?: string; signal?: AbortSignal },
): Promise<Cue[]> {
  const timedTextContext = await getTimedTextContext(track, opts?.signal);
  if (track.baseUrl.includes('exp=xpe') && !timedTextContext?.poToken) {
    console.warn(
      '[yt-focus] timedtext URL requires a subtitle PO token, but none was captured',
    );
    return [];
  }

  // Keep this intentionally conservative: YouTube's current web player asks
  // for json3, and trying extra formats after an empty or blocked response
  // quickly turns one miss into several timedtext requests.
  const formats: Array<string | null> = ['json3'];
  for (const fmt of formats) {
    const result = await tryFormat(track, fmt, {
      translateTo: opts?.translateTo,
      timedTextContext,
      signal: opts?.signal,
    });
    if (result.type === 'rate-limited') throw new TimedTextRateLimitError();
    if (result.type === 'success' && result.cues.length > 0) return result.cues;
  }
  return [];
}
