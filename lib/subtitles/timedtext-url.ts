import type { CaptionTrack } from './types';

export type TimedTextContext = {
  poToken?: string;
  clientName?: string;
  clientVersion?: string;
  browserName?: string;
  browserVersion?: string;
  osName?: string;
  osVersion?: string;
  platform?: string;
};

function setOrAppendParam(url: string, key: string, value: string): string {
  const encodedValue = encodeURIComponent(value);
  const re = new RegExp(`([?&])${key}=[^&]*`);
  if (re.test(url)) return url.replace(re, `$1${key}=${encodedValue}`);
  return url + (url.includes('?') ? '&' : '?') + `${key}=${encodedValue}`;
}

function removeParam(url: string, key: string): string {
  const parsed = new URL(url);
  parsed.searchParams.delete(key);
  return parsed.toString();
}

function withTranslation(
  url: string,
  track: CaptionTrack,
  translateTo?: string,
): string {
  if (translateTo && translateTo !== track.languageCode) {
    return setOrAppendParam(url, 'tlang', translateTo);
  }
  return removeParam(url, 'tlang');
}

function withFormat(url: string, fmt: string | null): string {
  if (fmt) return setOrAppendParam(url, 'fmt', fmt);
  return removeParam(url, 'fmt');
}

function withProofOfOrigin(url: string, context?: TimedTextContext | null): string {
  const poToken = context?.poToken;
  if (!poToken) return url;

  let next = url;
  next = setOrAppendParam(next, 'potc', '1');
  next = setOrAppendParam(next, 'pot', poToken);
  next = setOrAppendParam(next, 'c', context.clientName ?? 'WEB');
  next = setOrAppendParam(next, 'cplayer', 'UNIPLAYER');
  next = setOrAppendParam(next, 'cplatform', context.platform ?? 'DESKTOP');
  next = setOrAppendParam(next, 'xorb', '2');
  next = setOrAppendParam(next, 'xobt', '3');
  next = setOrAppendParam(next, 'xovt', '3');

  if (context.clientVersion) {
    next = setOrAppendParam(next, 'cver', context.clientVersion);
  }
  if (context.browserName) {
    next = setOrAppendParam(next, 'cbr', context.browserName);
  }
  if (context.browserVersion) {
    next = setOrAppendParam(next, 'cbrver', context.browserVersion);
  }
  if (context.osName) {
    next = setOrAppendParam(next, 'cos', context.osName);
  }
  if (context.osVersion) {
    next = setOrAppendParam(next, 'cosver', context.osVersion);
  }

  return next;
}

export function buildTimedTextUrl(
  track: CaptionTrack,
  fmt: string | null,
  opts?: {
    translateTo?: string;
    timedTextContext?: TimedTextContext | null;
  },
): string {
  const translated = withTranslation(track.baseUrl, track, opts?.translateTo);
  const formatted = withFormat(translated, fmt);
  return withProofOfOrigin(formatted, opts?.timedTextContext);
}

export function timedTextContextFromUrl(url: string): TimedTextContext | null {
  let parsed: URL;
  try {
    parsed = new URL(
      url,
      typeof location === 'undefined' ? 'https://www.youtube.com' : location.href,
    );
  } catch {
    return null;
  }

  if (parsed.pathname !== '/api/timedtext') return null;
  const poToken = parsed.searchParams.get('pot');
  if (!poToken) return null;

  return {
    poToken,
    clientName: parsed.searchParams.get('c') ?? undefined,
    clientVersion: parsed.searchParams.get('cver') ?? undefined,
    browserName: parsed.searchParams.get('cbr') ?? undefined,
    browserVersion: parsed.searchParams.get('cbrver') ?? undefined,
    osName: parsed.searchParams.get('cos') ?? undefined,
    osVersion: parsed.searchParams.get('cosver') ?? undefined,
    platform: parsed.searchParams.get('cplatform') ?? undefined,
  };
}
