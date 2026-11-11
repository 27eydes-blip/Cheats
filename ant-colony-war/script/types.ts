/**
 * Script format.
 *
 * Each episode is a list of beats. A beat is one line of narration plus the shot it plays over.
 * The shot changes exactly when the narrator starts the beat's first word.
 *
 * Inline markup inside `text`:
 *   *word*            highlight in green in the captions
 *   ^word^            highlight in orange in the captions
 *   {snap}word        trap-jaw SNAP effect lands on this word (freeze, flash, shockwave, shake, crack)
 *   {impact}word      impact hit + camera shake on this word
 *   {shake}word       camera shake only
 *   {flash}word       white flash (lightning, explosions)
 *   [250|two fifty]   show "250" in captions but have the narrator say "two fifty"
 *
 * Numbers, "dead", "fire ants", "my colony", "Kesh", "queen" and so on are highlighted automatically
 * (see src/timeline/highlight.ts).
 */
export type SceneId =
  | 'black'
  | 'colony'
  | 'hero'
  | 'closeup'
  | 'surface'
  | 'flood'
  | 'amoeba'
  | 'infection'
  | 'senses'
  | 'fireColony'
  | 'swarm'
  | 'battle'
  | 'kesh'
  | 'duel'
  | 'queen'
  | 'council'
  | 'army';

export type Beat = {
  scene: SceneId;
  text: string;
  /** Silence after this line, in seconds (dramatic pause). Default 0.5. */
  pause?: number;
  /** Heartbeat under this line. */
  tense?: boolean;
  /** Hyper-senses: slow motion, sound ripples, outlines through the dirt. */
  senses?: boolean;
  /** Fire attack: embers, smoke, orange glow taking over the screen. */
  fire?: boolean;
  /** Rain over the shot (surface / flood). */
  rain?: boolean;
  /** Override how infected 250 looks in this beat, 0..1 (green veins + eye glint). */
  infection?: number;
  /** Camera move for this shot. Default 'push'. */
  camera?: 'push' | 'pull' | 'still' | 'drift';
  /** Who 250 faces in a 'duel' shot. Default 'kesh'. */
  with?: 'kesh' | 'elder';
};

export type Episode = {
  n: number;
  title: string;
  /** How far the amoeba has taken 250, 0..1. Drives the green glint and veins. */
  infection: number;
  /** Override the end card line. Default: FOLLOW FOR PART n+1. */
  endCard?: string;
  beats: Beat[];
};
