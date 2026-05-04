import { bridgeGetTracks, bridgeGetVideoId } from './bridge';
import type { CaptionTrack } from './types';

type RawTrack = {
  baseUrl?: string;
  languageCode?: string;
  vssId?: string;
  kind?: string;
  name?: { simpleText?: string; runs?: Array<{ text?: string }> };
};

function nameOf(raw: RawTrack): string {
  const name = raw.name;
  if (!name) return raw.languageCode ?? '';
  if (typeof name.simpleText === 'string') return name.simpleText;
  const runs = name.runs;
  if (Array.isArray(runs)) return runs.map((r) => r?.text ?? '').join('');
  return raw.languageCode ?? '';
}

function normalize(raw: RawTrack): CaptionTrack | null {
  if (!raw.baseUrl || !raw.languageCode || !raw.vssId) return null;
  const track: CaptionTrack = {
    baseUrl: raw.baseUrl,
    languageCode: raw.languageCode,
    languageName: nameOf(raw),
    vssId: raw.vssId,
  };
  if (raw.kind === 'asr') track.kind = 'asr';
  return track;
}

export async function discoverTracks(): Promise<{
  videoId: string | null;
  tracks: CaptionTrack[];
}> {
  // ytInitialPlayerResponse can lag the URL change on SPA navs. Retry briefly
  // until videoId matches the URL or we've waited long enough.
  const targetId = new URL(location.href).searchParams.get('v');
  for (let attempt = 0; attempt < 10; attempt++) {
    const [tracksRaw, videoId] = await Promise.all([
      bridgeGetTracks().catch(() => [] as RawTrack[]),
      bridgeGetVideoId().catch(() => null),
    ]);
    if (!targetId || videoId === targetId || attempt === 9) {
      const tracks = (tracksRaw as RawTrack[])
        .map(normalize)
        .filter((t): t is CaptionTrack => t !== null);
      return { videoId, tracks };
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return { videoId: null, tracks: [] };
}
