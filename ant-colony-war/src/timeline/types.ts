export type Cue = 'snap' | 'impact' | 'shake' | 'flash';
export type Highlight = 'green' | 'orange' | 'blue' | null;

export type Token = {
  /** What the captions show. */
  display: string;
  /** What the narrator says. */
  spoken: string;
  cues: Cue[];
  hl: Highlight;
  /** Spoken by the Green (inside [brackets]). */
  green?: boolean;
  /** Inside "quotes" (someone else's words, remembered). */
  quote?: boolean;
};

export type Word = {
  text: string;
  /** Seconds from the start of the episode. */
  start: number;
  end: number;
  beat: number;
  hl: Highlight;
  cues: Cue[];
  green?: boolean;
  quote?: boolean;
};

export type BeatTiming = { start: number; end: number };

export type Timeline = {
  episode: number;
  /** Audio file under public/, or null when rendering a silent preview. */
  audio: string | null;
  /** When the narration audio starts, seconds. */
  narrationStart: number;
  /** When the end card starts, seconds. */
  endStart: number;
  duration: number;
  words: Word[];
  beats: BeatTiming[];
  mock: boolean;
};

/** Per-beat alignment returned by the TTS step: start/end of each spoken token, seconds from the beat audio start. */
export type BeatAlignment = { duration: number; tokens: { start: number; end: number }[] };
