import { createVocalChain } from "../effects/chain";
import { createMaster, type MasterBus } from "../effects/master";
import { PRESETS } from "../effects/presets";
import { clipLength, clipStart } from "../studio/timeline";
import type { Project, Track } from "../types";

/**
 * The mix graph, shared by live playback (AudioContext) and export
 * (OfflineAudioContext) so both always sound identical.
 */

/** Fader gain after mute / solo. */
export function audibleGain(track: Track, project: Project): number {
  const anySolo = project.tracks.some((t) => t.solo);
  if (track.muted) return 0;
  if (anySolo && !track.solo) return 0;
  return track.volume;
}

/**
 * Tuned buffers can carry generated layers (octave-up ad-libs, harmonies…) as
 * extra channels: channel 0 is the lead, the rest are layers — not stereo.
 */
const layered = new WeakSet<AudioBuffer>();
export function markLayered(buffer: AudioBuffer): void {
  layered.add(buffer);
}

export interface TrackStrip {
  input: AudioNode;
  /** Input for layered buffers (channel 0 = lead, channel 1 = layer). */
  layeredInput?: AudioNode;
  update(track: Track, project: Project, immediate?: boolean): void;
  dispose(): void;
}

export function createTrackStrip(
  ctx: BaseAudioContext,
  dest: AudioNode,
  track: Track,
  project: Project,
): TrackStrip {
  const input = ctx.createGain();
  const fader = ctx.createGain();
  // Vocals run through the preset effect chain; beats go straight to the fader.
  const chain = track.kind === "vocal" ? createVocalChain(ctx) : null;
  let layeredInput: ChannelSplitterNode | undefined;
  if (chain) {
    input.connect(chain.input);
    chain.output.connect(fader);
    layeredInput = ctx.createChannelSplitter(2);
    layeredInput.connect(chain.input, 0);
    layeredInput.connect(chain.layerInput, 1);
  } else {
    input.connect(fader);
  }
  fader.connect(dest);

  const strip: TrackStrip = {
    input,
    layeredInput,
    update(t, p, immediate = false) {
      const g = audibleGain(t, p);
      if (immediate) fader.gain.value = g;
      else fader.gain.setTargetAtTime(g, ctx.currentTime, 0.015);
      chain?.set(PRESETS[t.preset] ?? PRESETS.clean, p.bpm, t.fxAmount, immediate);
    },
    dispose() {
      input.disconnect();
      layeredInput?.disconnect();
      fader.disconnect();
      chain?.dispose();
    },
  };
  strip.update(track, project, true);
  return strip;
}

export { createMaster, type MasterBus };

export interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

/**
 * Starts a track's audio so that timeline position `pos` is heard at context time `when`.
 * Returns null when the clip is already over at `pos`.
 */
export function startVoice(
  ctx: BaseAudioContext,
  strip: TrackStrip,
  buffer: AudioBuffer,
  track: Track,
  project: Project,
  when: number,
  pos: number,
  fadeIn = 0,
): Voice | null {
  const start = clipStart(track, project);
  const length = Math.min(clipLength(track), buffer.duration - track.trimStart);
  if (length <= 0 || pos >= start + length) return null;
  const into = Math.max(0, pos - start);
  const delay = Math.max(0, start - pos);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  if (fadeIn > 0) {
    gain.gain.setValueAtTime(0, when + delay);
    gain.gain.linearRampToValueAtTime(1, when + delay + fadeIn);
  }
  const isLayered = layered.has(buffer) && !!strip.layeredInput;
  if (isLayered) {
    // Keep the channels separate on their way to the splitter.
    gain.channelCountMode = "explicit";
    gain.channelCount = buffer.numberOfChannels;
    gain.channelInterpretation = "discrete";
  }
  src.connect(gain).connect(isLayered ? (strip.layeredInput as AudioNode) : strip.input);
  src.start(when + delay, track.trimStart + into, length - into);
  return { src, gain };
}

export function stopVoice(ctx: BaseAudioContext, voice: Voice): void {
  const now = ctx.currentTime;
  try {
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0, now, 0.006);
    voice.src.stop(now + 0.04);
  } catch {
    /* already stopped */
  }
  voice.src.onended = () => {
    voice.src.disconnect();
    voice.gain.disconnect();
  };
}
