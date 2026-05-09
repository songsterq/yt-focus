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
