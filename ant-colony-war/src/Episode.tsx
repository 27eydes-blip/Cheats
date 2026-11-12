import React, { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Episode as Ep } from '../script/types';
import { Finish } from './art/Atmosphere';
import { SCENE_SHIFT } from './config';
import { FireFx, FlashFx, SensesFx, SnapFx, shakeAt } from './fx/Effects';
import { clamp, ease } from './lib/random';
import { ALL_SCENES as SCENES } from './scenes';
import type { SceneProps } from './scenes/types';
import { SoundTrack } from './SoundTrack';
import { getTimeline } from './timeline/load';
import { buildClock, jawAt } from './timeline/remap';
import { Captions, groupWords } from './ui/Captions';
import { EndCard, TitleCard } from './ui/Cards';

const keshScarred = (ep: Ep, beat: number) => ep.n > 5 || (ep.n === 5 && beat >= 6);
const infectionFor = (ep: Ep, beat: number) => ep.beats[beat].infection ?? ep.infection;

/** Shot transition length (seconds): soft dissolves in and out of black, quick dissolves elsewhere. */
const fadeLen = (a: string, b: string) => (a === b ? 0 : a === 'dark' || b === 'dark' ? 0.6 : 0.28);

export const EpisodeVideo: React.FC<{ ep: Ep }> = ({ ep }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tl = useMemo(() => getTimeline(ep), [ep]);
  const clock = useMemo(() => buildClock(tl, ep, fps), [tl, ep, fps]);
  const groups = useMemo(() => groupWords(tl.words), [tl]);
  const time = frame / fps;
  const T = clock.T[Math.min(frame, clock.T.length - 1)];

  // which shot(s) are on screen
  let bi = tl.beats.findIndex((b) => time >= b.start && time < b.end);
  if (bi < 0) bi = time < tl.beats[0].start ? 0 : tl.beats.length - 1;

  const propsFor = (i: number): SceneProps => {
    const beat = ep.beats[i];
    const t = T - clock.beatT[i];
    const dur = (tl.beats[i].end - tl.beats[i].start) * (beat.senses ? 0.5 : 1);
    const since = (list: number[]) => { let d = Infinity; for (const s of list) if (s <= T + 1e-6) d = T - s; return d; };
    return { t, T, dur, beat, ep, inf: infectionFor(ep, i), jaw: jawAt(T, clock.snapsT), keshScarred: keshScarred(ep, i), index: i, sinceSnap: since(clock.snapsT), sinceImpact: since(clock.impactsT) };
  };

  const layers: { i: number; opacity: number }[] = [{ i: bi, opacity: 1 }];
  if (bi > 0) {
    const fl = fadeLen(ep.beats[bi - 1].scene, ep.beats[bi].scene);
    const k = fl ? (time - tl.beats[bi].start) / fl : 1;
    if (k < 1) {
      layers[0].opacity = ease(k);
      layers.unshift({ i: bi - 1, opacity: 1 });
    }
  }

  const cur = propsFor(bi);
  const def = SCENES[ep.beats[bi].scene];
  const pal = def.pal(cur);

  // camera: slow push-ins, drift, heartbeat pulse, shake
  const beat = ep.beats[bi];
  const shotK = ease(cur.t / Math.max(2, cur.dur));
  const mode = beat.camera ?? (beat.scene === 'dark' ? 'drift' : 'push');
  const zoom = mode === 'push' ? 1 + 0.1 * shotK : mode === 'pull' ? 1.1 - 0.1 * shotK : mode === 'still' ? 1.04 : 1.03 + 0.02 * Math.sin(T * 0.2);
  const hb = beat.tense ? Math.pow(Math.max(0, Math.sin(time * Math.PI * 2 * 1.2)), 12) * 0.012 : 0;
  const sh = shakeAt(time, clock.cues);
  const driftX = Math.sin(T * 0.17) * 12, driftY = Math.cos(T * 0.13) * 10;
  const cam = `translate(${driftX + sh.x}px, ${driftY + sh.y + SCENE_SHIFT}px) rotate(${Math.sin(T * 0.11) * 0.35 + sh.r}deg) scale(${1.06 * zoom * (1 + hb)})`;

  // effect intensities
  const sensesK = beat.senses ? clamp((time - tl.beats[bi].start) / 0.5) : 0;
  const fireK = beat.fire ? clamp(0.35 + (time - tl.beats[bi].start) / 3) : 0;
  const snaps = useMemo(
    () => clock.cues.filter((c) => c.type === 'snap').map((c) => {
      const b = tl.beats.findIndex((x) => c.at >= x.start && c.at < x.end);
      const bb = Math.max(0, b);
      const p = { t: 0, T: 0, dur: 1, beat: ep.beats[bb], ep, inf: infectionFor(ep, bb), jaw: 1, keshScarred: keshScarred(ep, bb), index: bb, sinceSnap: Infinity, sinceImpact: Infinity };
      const [fx, fy] = SCENES[ep.beats[bb].scene].focus(p);
      return { at: c.at, focus: [fx, fy + SCENE_SHIFT] as [number, number] };
    }),
    [clock, tl, ep],
  );
  const flicker = 1 + 0.035 * Math.sin(T * 13.7) * Math.sin(T * 4.1);
  const sceneFilter = `brightness(${flicker * (beat.senses ? 0.9 : 1)}) saturate(${beat.senses ? 1 - 0.4 * sensesK : 1}) contrast(${1.06 + 0.08 * sensesK})`;

  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: cam, transformOrigin: '50% 45%', filter: sceneFilter }}>
        {layers.map(({ i, opacity }) => {
          const S = SCENES[ep.beats[i].scene].render;
          return (
            <AbsoluteFill key={i} style={{ opacity }}>
              <S {...propsFor(i)} />
            </AbsoluteFill>
          );
        })}
      </AbsoluteFill>
      <FireFx k={fireK} t={T} />
      <SensesFx k={sensesK} t={T} focus={[def.focus(cur)[0], def.focus(cur)[1] + SCENE_SHIFT]} />
      <Finish frame={frame} pal={pal} vignette={1 + hb * 20} />
      <FlashFx cues={clock.cues} time={time} />
      <SnapFx snaps={snaps} time={time} />
      <Captions groups={groups} time={time} />
      <TitleCard n={ep.n} title={ep.title} t={time} frame={frame} lead={tl.narrationStart} />
      <EndCard text={ep.endCard ?? `FOLLOW FOR PART ${ep.n + 1}`} t={time - tl.endStart} frame={frame} infection={ep.infection} />
      <SoundTrack ep={ep} tl={tl} cues={clock.cues} />
    </AbsoluteFill>
  );
};
