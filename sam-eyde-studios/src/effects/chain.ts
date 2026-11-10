import { delaySeconds, type PresetDef } from "./presets";
import { reverbImpulse } from "./reverb";

/**
 * One vocal effect chain, built from plain Web Audio nodes so the very same
 * code runs in live playback and in the offline export render.
 *
 *   in → high-pass → mud cut → presence → [tape saturation → compressor] → air shelf ─┐
 *        ┌────────────────────────────────────────────────────────────────────────────┘
 *        ├→ dry ─────────────────────────────────────────→ out
 *        ├→ doubler (two modulated delays, L / R) ────────→ out
 *        ├→ chorus (slow, deep, L / R) ───────────────────→ out
 *        ├→ delay A ⇄ delay B (filtered, ping-pong) ──┬───→ out
 *        │                                            └→ reverb
 *        └→ pre-delay → reverb ───────────────────────────→ out
 *
 *   layer in (generated voice, e.g. octave up) → high-pass ─┬→ out (quiet)
 *                                                           └→ reverb
 */
export interface VocalChain {
  input: AudioNode;
  /** Input for the preset's generated layer (octave-up ad-libs etc.). */
  layerInput: AudioNode;
  output: AudioNode;
  /** `amount` is the FX Amount slider, 0..2. */
  set(preset: PresetDef, bpm: number, amount: number, immediate?: boolean): void;
  dispose(): void;
}

/** Soft tape-style saturation curve; more drive = more harmonics. */
function tapeCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 2048;
  const curve = new Float32Array(n);
  const k = 1 + drive * 5;
  const norm = Math.tanh(k);
  // A little asymmetry adds the even harmonics that make tape sound warm.
  const shape = (x: number) => Math.tanh(k * (x + 0.04 * drive * (1 - x * x))) / norm;
  const zero = shape(0); // silence in must stay silence out
  for (let i = 0; i < n; i++) curve[i] = shape((i / (n - 1)) * 2 - 1) - zero;
  return curve;
}

export function createVocalChain(ctx: BaseAudioContext): VocalChain {
  const input = ctx.createGain();
  const layerInput = ctx.createGain();
  const output = ctx.createGain();
  const all: AudioNode[] = [input, layerInput, output];
  const make = <T extends AudioNode>(node: T): T => {
    all.push(node);
    return node;
  };
  const gain = (value: number) => {
    const g = make(ctx.createGain());
    g.gain.value = value;
    return g;
  };
  const filter = (type: BiquadFilterType, hz: number, q = 0.7) => {
    const f = make(ctx.createBiquadFilter());
    f.type = type;
    f.frequency.value = hz;
    f.Q.value = q;
    return f;
  };
  const lfos: OscillatorNode[] = [];
  /** A delay line whose time wobbles slowly, panned to one side. */
  const modDelay = (from: AudioNode, base: number, rate: number, pan: number) => {
    const delay = make(ctx.createDelay(0.1));
    delay.delayTime.value = base;
    const lfo = make(ctx.createOscillator());
    lfo.frequency.value = rate;
    const depth = gain(0);
    lfo.connect(depth).connect(delay.delayTime);
    lfo.start();
    lfos.push(lfo);
    const panner = make(ctx.createStereoPanner());
    panner.pan.value = pan;
    from.connect(delay).connect(panner).connect(output);
    return { depth, lfo };
  };

  // --- EQ ---
  const hp = filter("highpass", 20);
  const mud = filter("peaking", 400, 1.1);
  const presence = filter("peaking", 3500, 0.9);
  const air = filter("highshelf", 9000);
  input.connect(hp).connect(mud).connect(presence);
  presence.connect(air);
  air.connect(output); // dry

  // --- Saturation + compressor insert (only patched in when a preset uses it) ---
  const satIn = gain(1);
  const shaper = make(ctx.createWaveShaper());
  shaper.oversample = "2x";
  const comp = make(ctx.createDynamicsCompressor());
  const insertOut = gain(1);
  // The asymmetric curve can leave a little DC behind; block it before the compressor.
  const dcBlock = filter("highpass", 25);
  satIn.connect(shaper).connect(dcBlock).connect(comp).connect(insertOut);
  let insertOn = false;
  let satDrive = -1;

  // --- Stereo doubler + slow chorus ---
  const dblSend = gain(0);
  air.connect(dblSend);
  const doubles = [modDelay(dblSend, 0.013, 0.31, -0.9), modDelay(dblSend, 0.021, 0.43, 0.9)];
  const chorusSend = gain(0);
  air.connect(chorusSend);
  const chorus = [modDelay(chorusSend, 0.027, 0.17, -0.55), modDelay(chorusSend, 0.034, 0.21, 0.55)];

  // --- Tempo delay: two lines feeding each other, so repeats can bounce L / R ---
  const dlySend = gain(0);
  const delayA = make(ctx.createDelay(2));
  const delayB = make(ctx.createDelay(2));
  const toneA = filter("lowpass", 4000);
  const toneB = filter("lowpass", 4000);
  const lowA = filter("highpass", 220);
  const lowB = filter("highpass", 220);
  const aToB = gain(0);
  const bToA = gain(0);
  const panA = make(ctx.createStereoPanner());
  const panB = make(ctx.createStereoPanner());
  const dlyToRev = gain(0);
  air.connect(dlySend).connect(delayA);
  delayA.connect(toneA).connect(lowA); // repeats are heard after the filter, so they sit behind the voice
  lowA.connect(panA).connect(output);
  lowA.connect(aToB).connect(delayB);
  delayB.connect(toneB).connect(lowB);
  lowB.connect(panB).connect(output);
  lowB.connect(bToA).connect(delayA);
  lowA.connect(dlyToRev);
  lowB.connect(dlyToRev);

  // --- Reverb (generated impulse response) ---
  const revSend = gain(0);
  const predelay = make(ctx.createDelay(0.2));
  const convolver = make(ctx.createConvolver());
  let reverbConnected = false;
  let reverbKey = "";
  air.connect(revSend).connect(predelay);
  dlyToRev.connect(predelay);

  // --- Generated layer (e.g. octave-up ad-libs): thin, quiet, drenched ---
  const layerHp = filter("highpass", 350);
  const layerDry = gain(0);
  const layerRev = gain(0);
  layerInput.connect(layerHp);
  layerHp.connect(layerDry).connect(output);
  layerHp.connect(layerRev).connect(predelay);

  const param = (p: AudioParam, value: number, immediate: boolean, tc = 0.03) => {
    if (immediate) p.value = value;
    else p.setTargetAtTime(value, ctx.currentTime, tc);
  };

  let lastSig = "";

  return {
    input,
    layerInput,
    output,
    set(preset, bpm, amount, immediate = false) {
      const sig = `${preset.id}|${bpm}|${amount}`;
      if (sig === lastSig) return;
      lastSig = sig;
      const a = Math.min(2, Math.max(0, amount));
      const eq = Math.min(a, 1.5);
      const upTo1 = Math.min(a, 1);

      // EQ
      param(hp.frequency, 20 + (preset.hpHz - 20) * upTo1, immediate);
      param(mud.frequency, preset.mud?.hz ?? 400, immediate);
      param(mud.gain, (preset.mud?.db ?? 0) * eq, immediate);
      param(presence.gain, preset.presenceDb * eq, immediate);
      param(air.frequency, preset.airHz ?? 9000, immediate);
      param(air.gain, preset.airDb * eq, immediate);

      // Saturation + compression
      const wantInsert = !!(preset.saturation || preset.comp) && a > 0;
      if (wantInsert) {
        const drive = (preset.saturation?.drive ?? 0) * Math.min(a, 1.6);
        if (Math.abs(drive - satDrive) > 0.01) {
          shaper.curve = drive > 0 ? tapeCurve(drive) : null;
          satDrive = drive;
        }
        const c = preset.comp;
        // Below 100 % the compressor eases off towards no compression.
        const ratio = c ? 1 + (c.ratio - 1) * upTo1 : 1;
        const threshold = c ? c.thresholdDb * upTo1 : 0;
        param(comp.threshold, threshold, immediate);
        param(comp.ratio, ratio, immediate);
        param(comp.knee, 8, immediate);
        param(comp.attack, c?.attack ?? 0.01, immediate);
        param(comp.release, c?.release ?? 0.15, immediate);
        // The compressor adds automatic make-up gain; hand back half of it so the
        // vocal gets denser without jumping out of the mix.
        const fullRangeDb = threshold - threshold / ratio;
        param(insertOut.gain, 10 ** ((fullRangeDb * 0.6 * 0.5) / 20), immediate);
      }
      if (wantInsert !== insertOn) {
        presence.disconnect();
        insertOut.disconnect();
        if (wantInsert) {
          presence.connect(satIn);
          insertOut.connect(air);
        } else {
          presence.connect(air);
        }
        insertOn = wantInsert;
      }

      // Doubles + chorus
      param(dblSend.gain, (preset.doubler?.mix ?? 0) * a, immediate);
      for (const d of doubles) param(d.depth.gain, (preset.doubler?.depthMs ?? 0) / 1000, immediate);
      const ch = preset.chorus;
      param(chorusSend.gain, (ch?.mix ?? 0) * a, immediate);
      chorus.forEach((c, i) => {
        param(c.depth.gain, (ch?.depthMs ?? 0) / 1000, immediate);
        param(c.lfo.frequency, (ch?.rateHz ?? 0.17) * (i === 0 ? 1 : 1.23), immediate);
      });

      // Delay
      const d = preset.delay;
      const time = delaySeconds(preset, bpm);
      const fb = Math.min(0.85, (d?.feedback ?? 0) * (0.6 + 0.4 * Math.min(a, 1.5)));
      param(dlySend.gain, (d?.mix ?? 0) * a, immediate);
      param(delayA.delayTime, time, immediate, 0.05);
      param(delayB.delayTime, time, immediate, 0.05);
      param(aToB.gain, fb, immediate);
      param(bToA.gain, fb, immediate);
      param(toneA.frequency, d?.toneHz ?? 4000, immediate);
      param(toneB.frequency, d?.toneHz ?? 4000, immediate);
      const width = d?.pingPong ?? 0;
      param(panA.pan, -width, immediate);
      param(panB.pan, width, immediate);
      param(dlyToRev.gain, (d?.toReverb ?? 0) * upTo1, immediate);

      // Layer
      param(layerDry.gain, (preset.layer?.dry ?? 0) * a, immediate);
      param(layerRev.gain, (preset.layer?.reverb ?? 0) * a, immediate);

      // Reverb
      const rev = preset.reverb;
      const wet = (rev?.mix ?? 0) * a;
      param(revSend.gain, wet, immediate);
      if (rev && wet > 0) {
        const key = `${rev.seconds}|${rev.toneHz}`;
        if (key !== reverbKey) {
          convolver.buffer = reverbImpulse(ctx.sampleRate, rev.seconds, rev.toneHz);
          reverbKey = key;
        }
        param(predelay.delayTime, rev.predelayMs / 1000, immediate);
        if (!reverbConnected) {
          predelay.connect(convolver).connect(output);
          reverbConnected = true;
        }
      } else if (reverbConnected) {
        // No reverb in use: unplug the convolver so it costs no CPU.
        predelay.disconnect();
        convolver.disconnect();
        reverbConnected = false;
      }
    },
    dispose() {
      for (const l of lfos) {
        try {
          l.stop();
        } catch {
          /* already stopped */
        }
      }
      for (const n of all) n.disconnect();
    },
  };
}
