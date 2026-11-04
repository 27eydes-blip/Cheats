// Every obstacle type the manager can spawn, by type name.
import { ClosingWalls, Slammer, Tendril } from "./biomes/abyss.js";
import { FireBar, Geyser, Meteor } from "./biomes/solar.js";
import { FrostComet, IceSlider, Icicle, ZapOrbs } from "./biomes/frozen.js";
import { BlinkBlock, BrokenLaser, GravityZone } from "./biomes/glitch.js";
import { Debris, StormBolt, Twister } from "./biomes/hurricane.js";
import { BloomGate, PuffDrift, ThornVine } from "./biomes/valley.js";
import { Blade, Laser } from "./biomes/void.js";
import { ClockGear, Pendulum, RewindBlade, TimeZone } from "./biomes/chrono.js";
import { Spire, SweepBar, VoidOrb } from "./biomes/mirror.js";
import { GlassWall, MirrorLaser, RotPrism } from "./biomes/prism.js";
import { BubbleColumn, Current, Jellyfish, SeaMine } from "./biomes/tidal.js";
import { Gate, Portal, Saw } from "./shared.js";

export const TYPES = {
  // shared
  saw: Saw,
  gate: Gate,
  portal: Portal,
  // Neon Void
  blade: Blade,
  laser: Laser,
  // Solar Storm
  geyser: Geyser,
  meteor: Meteor,
  firebar: FireBar,
  // Frozen Nebula
  icicle: Icicle,
  slider: IceSlider,
  zap: ZapOrbs,
  comet: FrostComet,
  // Glitch Realm
  blink: BlinkBlock,
  blaser: BrokenLaser,
  zone: GravityZone,
  // Abyss
  tendril: Tendril,
  slammer: Slammer,
  walls: ClosingWalls,
  // Peaceful Valley
  vine: ThornVine,
  puffs: PuffDrift,
  bloom: BloomGate,
  // Hurricane
  debris: Debris,
  bolt: StormBolt,
  twister: Twister,
  // ---- dimensions
  mlaser: MirrorLaser,
  glass: GlassWall,
  rprism: RotPrism,
  jelly: Jellyfish,
  mine: SeaMine,
  current: Current,
  bubblecol: BubbleColumn,
  cgear: ClockGear,
  pendulum: Pendulum,
  timezone: TimeZone,
  rewind: RewindBlade,
  spire: Spire,
  vorb: VoidOrb,
  vbar: SweepBar,
};
