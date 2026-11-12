/**
 * Shot list format: episodes/epXX/scenes.json
 *
 * {
 *   "episode": 1,
 *   "title": "WAKE",
 *   "infection": 0.15,          // how far the amoeba has taken 250 (0..1): green veins + eye glint
 *   "shots": [ { "scene": "faceInDirt", "text": "Cold dirt on my face, ...", "tense": true, "options": { "eyes": "opening" } } ]
 * }
 *
 * Each shot is one piece of narration plus what's on screen while it's spoken. The shot cuts in exactly
 * when the narrator starts its first word. Joined together, the shots' text must match the episode in
 * script/season1.md word for word (checked by `npm run check` and before every audio/render run).
 *
 * Inline markup inside `text` (not spoken, not shown):
 *   {snap}word     trap-jaw SNAP on this word (freeze frame, white flash, shockwave, shake, crack)
 *   {impact}word   impact hit + camera shake
 *   {shake}word    camera shake only
 *   {flash}word    white flash (lightning) + thunder
 *   *word* ^word^  force a green / orange caption highlight
 */
export type SceneId =
  | 'dark'
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
  | 'army'
  | 'dirtMacro'
  | 'faceInDirt'
  | 'lyingInChamber'
  | 'deadStill'
  | 'eyeOpen'
  | 'waterDrop'
  | 'rise'
  | 'vast'
  | 'nursery'
  | 'antLine'
  | 'rootWall'
  | 'fall'
  | 'sky'
  | 'wasteChamber'
  | 'sandGrain'
  | 'twig'
  | 'scout'
  | 'ranks'
  | 'run'
  | 'shove'
  | 'chains'
  | 'lineup'
  | 'execution'
  | 'assassins'
  | 'royalChamber'
  | 'legs'
  | 'colonyQueen'
  | 'stepAside'
  | 'vask'
  | 'bridge'
  | 'bump'
  | 'throneRoom'
  | 'coldTunnels'
  | 'taviClose'
  | 'kael'
  | 'healingChamber'
  | 'hideout'
  | 'velkaChamber'
  | 'theGreen'
  | 'purge'
  | 'collapse'
  | 'burningCreek'
  | 'rebuild';

export type Shot = {
  scene: SceneId;
  text: string;
  /** Silence after this line, seconds (dramatic pause). Default 0.5. */
  pause?: number;
  /** Heartbeat under this shot. */
  tense?: boolean;
  /** Hyper senses: slow motion, sound ripples, outlines through the dirt. */
  senses?: boolean;
  /** Fire attack: embers, smoke, orange glow taking over the screen. */
  fire?: boolean;
  rain?: boolean;
  /** Override 250's infection level for this shot, 0..1. */
  infection?: number;
  camera?: 'push' | 'pull' | 'still' | 'drift';
  /** Who 250 faces in a 'duel' shot. */
  with?: 'kesh' | 'elder';
  /** Scene-specific options, see README. */
  options?: Record<string, string | number | boolean>;
  /** Free text for you; ignored by the renderer. */
  note?: string;
  /** Quoted lines in this shot are other characters, remembered: give them a faint memory filter. */
  memory?: boolean;
  /** Red/green strobing (the purge). */
  strobe?: boolean;
  /** A full slow-motion moment for this shot. */
  slowmo?: boolean;
  /** Whip-pan into this shot. */
  whip?: boolean;
  /** Extra sound hits in this shot: [{ "name": "clamp", "at": 1.2 }] (seconds from the shot's start). */
  sfx?: { name: string; at: number; volume?: number }[];
  /** Deep mechanical breathing under this shot. */
  breathing?: boolean;
};

/** Kept as an alias: a "beat" is a shot. */
export type Beat = Shot;

/** Narrator delivery for an episode (ElevenLabs voice settings). */
export type VoiceTone = { stability?: number; style?: number; speed?: number };
/** How the Green's voice is processed: pitch down (semitones), whisper layer and echo, 0..1. */
export type GreenTone = { semitones: number; whisper: number; echo: number };

export type EpisodeFile = {
  /** 1 (default) or 2... */
  season?: number;
  voice?: VoiceTone;
  greenVoice?: GreenTone;
  episode: number;
  title: string;
  infection: number;
  /** Override the end card line. Default: FOLLOW FOR PART n+1. */
  endCard?: string;
  shots: Shot[];
};

export type Episode = {
  season: number;
  voice?: VoiceTone;
  greenVoice?: GreenTone;
  n: number;
  title: string;
  infection: number;
  endCard?: string;
  beats: Shot[];
};

export const toEpisode = (f: EpisodeFile): Episode => ({ season: f.season ?? 1, voice: f.voice, greenVoice: f.greenVoice, n: f.episode, title: f.title, infection: f.infection ?? 0, endCard: f.endCard, beats: f.shots });
