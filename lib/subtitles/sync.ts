import type { Cue } from './types';

export type SyncHandle = {
  stop(): void;
  setCues(cues: Cue[]): void;
};

function findActive(cues: Cue[], timeMs: number): Cue | null {
  if (cues.length === 0) return null;
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const c = cues[mid];
    if (timeMs < c.startMs) hi = mid - 1;
    else if (timeMs >= c.endMs) lo = mid + 1;
    else return c;
  }
  return null;
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
