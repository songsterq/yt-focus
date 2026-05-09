export type CaptionTrack = {
  baseUrl: string;
  languageCode: string;
  languageName: string;
  vssId: string;
  kind?: 'asr';
};

export type Cue = {
  startMs: number;
  endMs: number;
  text: string;
};

export type SecondarySelection =
  | { type: 'native'; track: CaptionTrack }
  | { type: 'translate'; sourceTrack: CaptionTrack; targetLang: string }
  | { type: 'off' };

export type DualState = {
  videoId: string | null;
  tracks: CaptionTrack[];
  primary: CaptionTrack | null;
  secondary: SecondarySelection;
};
