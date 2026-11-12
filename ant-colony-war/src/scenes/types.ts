import type { Beat, Episode } from '../../script/types';
import type { Palette } from '../art/palette';

export type SceneProps = {
  /** Story time since this shot started (slows down in senses, freezes on a snap). */
  t: number;
  /** Story time since the episode started. */
  T: number;
  /** Approximate shot length in story seconds. */
  dur: number;
  beat: Beat;
  ep: Episode;
  /** 250's infection level for this shot, 0..1. */
  inf: number;
  /** 250's mandible spread, 0 (just snapped) .. 1 (cocked). */
  jaw: number;
  /** Kesh has lost an antenna. */
  keshScarred: boolean;
  /** Index of this beat in the episode (used as a seed). */
  index: number;
  /** Story seconds since the last {snap} / {impact} cue (Infinity if none yet). */
  sinceSnap: number;
  sinceImpact: number;
  /** 250 is wearing Kesh's armor. */
  armor: boolean;
};

export type SceneDef = {
  pal: (p: SceneProps) => Palette;
  /** Where on screen the trap-jaw snap shockwave originates. */
  focus: (p: SceneProps) => [number, number];
  render: React.FC<SceneProps>;
};
