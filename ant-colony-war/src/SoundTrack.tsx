import React from 'react';
import { Audio, interpolate, Sequence, staticFile, useVideoConfig } from 'remotion';
import type { Episode } from '../script/types';
import type { Timeline } from './timeline/types';
import { isGreenShot } from './timeline/remap';

const SWARM_SCENES = new Set(['swarm', 'battle', 'army', 'fireColony', 'purge']);

/** Loop a sound over a time range with short fades. */
const Bed: React.FC<{ src: string; from: number; to: number; volume: number; fade?: number }> = ({ src, from, to, volume, fade = 0.4 }) => {
  const { fps } = useVideoConfig();
  const len = Math.max(1, Math.round((to - from) * fps));
  const f = Math.max(1, Math.round(fade * fps));
  return (
    <Sequence from={Math.round(from * fps)} durationInFrames={len} layout="none">
      <Audio src={staticFile(src)} loop volume={(fr) => volume * interpolate(fr, [0, f, Math.max(f + 1, len - f), len], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
    </Sequence>
  );
};

const Hit: React.FC<{ src: string; at: number; volume: number }> = ({ src, at, volume }) => {
  const { fps } = useVideoConfig();
  return (
    <Sequence from={Math.max(0, Math.round(at * fps))} layout="none">
      <Audio src={staticFile(src)} volume={volume} />
    </Sequence>
  );
};

/** Merge consecutive beats that share a flag into continuous ranges so loops don't restart. */
const ranges = (tl: Timeline, ep: Episode, test: (i: number) => boolean) => {
  const out: [number, number][] = [];
  tl.beats.forEach((b, i) => {
    if (!test(i)) return;
    const last = out[out.length - 1];
    if (last && Math.abs(last[1] - b.start) < 0.05) last[1] = b.end;
    else out.push([b.start, b.end]);
  });
  return out;
};

export const SoundTrack: React.FC<{ ep: Episode; tl: Timeline; cues: { type: string; at: number }[] }> = ({ ep, tl, cues }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {tl.audio && (
        <Sequence from={Math.round(tl.narrationStart * fps)} layout="none">
          <Audio src={staticFile(tl.audio)} volume={1} />
        </Sequence>
      )}
      <Bed src="sfx/drone.wav" from={0} to={tl.duration} volume={0.55} fade={1.5} />
      <Hit src="sfx/glitch.wav" at={0.05} volume={0.5} />
      <Hit src="sfx/whoosh.wav" at={0.0} volume={0.6} />
      <Hit src="sfx/impact.wav" at={0.55} volume={0.55} />
      <Hit src="sfx/glitch.wav" at={tl.narrationStart + 0.15} volume={0.35} />
      {ranges(tl, ep, (i) => !!ep.beats[i].tense).map(([a, b], i) => <Bed key={'hb' + i} src="sfx/heartbeat.wav" from={a} to={b} volume={0.8} fade={0.3} />)}
      {ranges(tl, ep, (i) => SWARM_SCENES.has(ep.beats[i].scene)).map(([a, b], i) => <Bed key={'sw' + i} src="sfx/swarm.wav" from={a} to={b} volume={0.45} />)}
      {ranges(tl, ep, (i) => !!ep.beats[i].fire).map(([a, b], i) => <Bed key={'fi' + i} src="sfx/fire.wav" from={a} to={b} volume={0.5} />)}
      {ranges(tl, ep, (i) => !!ep.beats[i].rain).map(([a, b], i) => <Bed key={'ra' + i} src="sfx/rain.wav" from={a} to={b} volume={0.5} />)}
      {ranges(tl, ep, (i) => !!ep.beats[i].senses).map(([a, b], i) => <Bed key={'se' + i} src="sfx/senses.wav" from={a} to={b} volume={0.6} fade={0.6} />)}
      {ranges(tl, ep, (i) => isGreenShot(ep.beats[i])).map(([a, b], i) => <Bed key={'gr' + i} src="sfx/green.wav" from={a} to={b} volume={0.55} fade={0.5} />)}
      {ranges(tl, ep, (i) => !!ep.beats[i].breathing).map(([a, b], i) => <Bed key={'br' + i} src="sfx/breath.wav" from={a} to={b} volume={0.8} fade={0.4} />)}
      {ranges(tl, ep, (i) => ep.beats[i].scene === 'burningCreek').map(([a, b], i) => <Bed key={'cr' + i} src="sfx/fire.wav" from={a} to={b} volume={0.45} />)}
      {ep.beats.map((b, i) => (b.whip ? <Hit key={'wh' + i} src="sfx/whip.wav" at={tl.beats[i].start - 0.05} volume={0.7} /> : null))}
      {ep.beats.flatMap((b, i) => (b.sfx ?? []).map((s, k) => <Hit key={'sx' + i + '-' + k} src={`sfx/${s.name}.wav`} at={tl.beats[i].start + s.at} volume={s.volume ?? 0.9} />))}
      {cues.map((c, i) =>
        c.type === 'snap' ? (
          <Hit key={'c' + i} src="sfx/snap.wav" at={c.at - 0.02} volume={1} />
        ) : c.type === 'impact' ? (
          <Hit key={'c' + i} src="sfx/impact.wav" at={c.at - 0.02} volume={0.9} />
        ) : c.type === 'flash' ? (
          <Hit key={'c' + i} src="sfx/thunder.wav" at={c.at} volume={0.9} />
        ) : (
          <Hit key={'c' + i} src="sfx/impact.wav" at={c.at} volume={0.5} />
        ),
      )}
      <Hit src="sfx/impact.wav" at={tl.endStart + 0.3} volume={0.7} />
      <Hit src="sfx/whoosh.wav" at={tl.endStart} volume={0.5} />
    </>
  );
};
