import { storage } from '#imports';

export type HiddenCounts = { shorts: number; playables: number };

export const shortsHiddenCountPref = storage.defineItem<number>(
  'local:shortsHiddenCount',
  { fallback: 0 },
);

export const playablesHiddenCountPref = storage.defineItem<number>(
  'local:playablesHiddenCount',
  { fallback: 0 },
);

function safeInt(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

export async function getHiddenCounts(): Promise<HiddenCounts> {
  const [shorts, playables] = await Promise.all([
    shortsHiddenCountPref.getValue(),
    playablesHiddenCountPref.getValue(),
  ]);
  return { shorts: safeInt(shorts), playables: safeInt(playables) };
}

export function watchHiddenCounts(
  cb: (counts: HiddenCounts) => void,
): () => void {
  const refresh = () => {
    void getHiddenCounts().then(cb);
  };
  const u1 = shortsHiddenCountPref.watch(refresh);
  const u2 = playablesHiddenCountPref.watch(refresh);
  return () => {
    u1();
    u2();
  };
}

export type HiddenCounter = {
  recordHidden(kind: 'shorts' | 'playables', els: Iterable<Element>): void;
  flush(): Promise<void>;
};

const FLUSH_DEBOUNCE_MS = 1000;

export function createHiddenCounter(): HiddenCounter {
  const seen = {
    shorts: new WeakSet<Element>(),
    playables: new WeakSet<Element>(),
  };
  const pending = { shorts: 0, playables: 0 };
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function doFlush(): Promise<void> {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    const dShorts = pending.shorts;
    const dPlayables = pending.playables;
    if (dShorts === 0 && dPlayables === 0) return;
    pending.shorts = 0;
    pending.playables = 0;
    const tasks: Promise<void>[] = [];
    if (dShorts > 0) {
      tasks.push(
        shortsHiddenCountPref.getValue().then((cur) =>
          shortsHiddenCountPref.setValue(safeInt(cur) + dShorts),
        ),
      );
    }
    if (dPlayables > 0) {
      tasks.push(
        playablesHiddenCountPref.getValue().then((cur) =>
          playablesHiddenCountPref.setValue(safeInt(cur) + dPlayables),
        ),
      );
    }
    await Promise.all(tasks);
  }

  function scheduleFlush() {
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void doFlush();
    }, FLUSH_DEBOUNCE_MS);
  }

  return {
    recordHidden(kind, els) {
      let added = 0;
      for (const el of els) {
        if (seen[kind].has(el)) continue;
        seen[kind].add(el);
        added++;
      }
      if (added === 0) return;
      pending[kind] += added;
      scheduleFlush();
    },
    flush: doFlush,
  };
}
