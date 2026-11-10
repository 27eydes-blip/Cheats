import { delaySeconds, type PresetDef } from "./presets";
import { reverbImpulse } from "./reverb";

/**
 * One vocal effect chain, built from plain Web Audio nodes so the very same
 * code runs in live playback and in the offline export render.
 *
 *   in → high-pass → presence EQ → air shelf ─┬→ dry ───────────────→ out
 *                                             ├→ doubler (L/R mod delays) → out
 *                                             ├→ tempo delay (filtered fb) → out
 *                                             └→ pre-delay → reverb ──────→ out
 */
export interface VocalChain {
  input: AudioNode;
  output: AudioNode;
  /** `amount` is the FX Amount slider, 0..2. */
  set(preset: PresetDef, bpm: number, amount: number, immediate?: boolean): void;
  dispose(): void;
}

export function createVocalChain(ctx: BaseAudioContext): VocalChain {
  const input = ctx.createGain();
  const output = ctx.createGain();

  // --- EQ ---
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.Q.value = 0.7;
  const presence = ctx.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = 3500;
  presence.Q.value = 0.9;
  const air = ctx.createBiquadFilter();
  air.type = "highshelf";
  air.frequency.value = 9000;
  input.connect(hp).connect(presence).connect(air);
  air.connect(output); // dry

  // --- Stereo doubler: two short modulated delays, panned hard-ish L / R ---
  const dblSend = ctx.createGain();
  dblSend.gain.value = 0;
  air.connect(dblSend);
  const lfos: OscillatorNode[] = [];
  const depths: GainNode[] = [];
  const doublerNodes: AudioNode[] = [];
  const voices = [
    { base: 0.013, rate: 0.31, pan: -0.9 },
    { base: 0.021, rate: 0.43, pan: 0.9 },
  ];
  for (const v of voices) {
    const delay = ctx.createDelay(0.1);
    delay.delayTime.value = v.base;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = v.rate;
    const depth = ctx.createGain();
    depth.gain.value = 0;
    lfo.connect(depth).connect(delay.delayTime);
    lfo.start();
    const pan = ctx.createStereoPanner();
    pan.pan.value = v.pan;
    dblSend.connect(delay).connect(pan).connect(output);
    lfos.push(lfo);
    depths.push(depth);
    doublerNodes.push(delay, pan);
  }

  // --- Tempo-synced delay with filtered feedback ---
  const dlySend = ctx.createGain();
  dlySend.gain.value = 0;
  const delay = ctx.createDelay(2);
  const fbTone = ctx.createBiquadFilter();
  fbTone.type = "lowpass";
  const fbLow = ctx.createBiquadFilter();
  fbLow.type = "highpass";
  fbLow.frequency.value = 220;
  const feedback = ctx.createGain();
  feedback.gain.value = 0;
  air.connect(dlySend).connect(delay);
  delay.connect(fbTone).connect(fbLow);
  fbLow.connect(feedback).connect(delay);
  fbLow.connect(output); // repeats are heard after the filter, so they sit behind the voice

  // --- Reverb (generated impulse response) ---
  const revSend = ctx.createGain();
  revSend.gain.value = 0;
  const predelay = ctx.createDelay(0.2);
  const convolver = ctx.createConvolver();
  let reverbConnected = false;
  let reverbKey = "";
  air.connect(revSend).connect(predelay);

  const param = (p: AudioParam, value: number, immediate: boolean, tc = 0.03) => {
    if (immediate) p.value = value;
    else p.setTargetAtTime(value, ctx.currentTime, tc);
  };

  let lastSig = "";

  return {
    input,
    output,
    set(preset, bpm, amount, immediate = false) {
      const sig = `${preset.id}|${bpm}|${amount}`;
      if (sig === lastSig) return;
      lastSig = sig;
      const a = Math.min(2, Math.max(0, amount));
      const eq = Math.min(a, 1.5);

      param(hp.frequency, 20 + (preset.hpHz - 20) * Math.min(a, 1), immediate);
      param(presence.gain, preset.presenceDb * eq, immediate);
      param(air.gain, preset.airDb * eq, immediate);

      param(dblSend.gain, (preset.doubler?.mix ?? 0) * a, immediate);
      for (const d of depths) param(d.gain, (preset.doubler?.depthMs ?? 0) / 1000, immediate);

      param(dlySend.gain, (preset.delay?.mix ?? 0) * a, immediate);
      param(delay.delayTime, delaySeconds(preset, bpm), immediate, 0.05);
      param(feedback.gain, Math.min(0.85, (preset.delay?.feedback ?? 0) * (0.6 + 0.4 * Math.min(a, 1.5))), immediate);
      param(fbTone.frequency, preset.delay?.toneHz ?? 4000, immediate);

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
      } else if (reverbConnected && wet === 0) {
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
        l.disconnect();
      }
      for (const n of [
        input, output, hp, presence, air, dblSend, dlySend, delay, fbTone, fbLow,
        feedback, revSend, predelay, convolver, ...depths, ...doublerNodes,
      ]) {
        n.disconnect();
      }
    },
  };
}
