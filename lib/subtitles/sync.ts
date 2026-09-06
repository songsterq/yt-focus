import type { Cue } from './types';

export type SyncHandle = {
  stop(): void;
  setCues(cues: Cue[]): void;
};

// YouTube's auto-generated (ASR) json3 tracks are two-row "roll-up"
// transcripts: each line's dDurationMs runs until the line after next starts,
// so consecutive cues overlap by a whole line. A single-line overlay can only
// show one cue at a time, so cut every cue off where the next one begins.
// Cues must be sorted by startMs.
export function clipOverlappingCues(cues: Cue[]): Cue[] {
  return cues.map((c, i) => {
    const next = cues[i + 1];
    if (!next || next.startMs >= c.endMs) return c;
    return { ...c, endMs: Math.max(c.startMs, next.startMs) };
  });
}

// Returns the most recently started cue that is still showing at timeMs.
// Binary-searches on startMs only, so it stays correct even if cues overlap.
export function findActive(cues: Cue[], timeMs: number): Cue | null {
  let lo = 0;
  let hi = cues.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (cues[mid].startMs <= timeMs) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (idx === -1) return null;
  const c = cues[idx];
  return timeMs < c.endMs ? c : null;
}

export function startSync(
  video: HTMLVideoElement,
  initialCues: Cue[],
  onChange: (text: string) => void,
): SyncHandle {
  let cues = initialCues;
  let lastText = '';
  let stopped = false;
  let raf = 0;

  const tick = () => {
    if (stopped) return;
    const t = video.currentTime * 1000;
    const active = findActive(cues, t);
    const text = active?.text ?? '';
    if (text !== lastText) {
      lastText = text;
      onChange(text);
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
    },
    setCues(next: Cue[]) {
      cues = next;
      lastText = '';
    },
  };
}
