/**
 * Master bus: a gentle glue compressor followed by a fast limiter that
 * catches peaks before they clip. Used for both playback and export.
 */
export interface MasterBus {
  input: AudioNode;
}

export function createMaster(ctx: BaseAudioContext): MasterBus {
  const input = ctx.createGain();

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 12;
  comp.ratio.value = 2.5;
  comp.attack.value = 0.012;
  comp.release.value = 0.22;
  // The compressor adds automatic make-up gain; take most of it back so the
  // master stays close to unity for normal levels.
  const trim = ctx.createGain();
  trim.gain.value = 0.62;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -2;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.09;
  const ceiling = ctx.createGain();
  ceiling.gain.value = 0.9;

  input.connect(comp).connect(trim).connect(limiter).connect(ceiling).connect(ctx.destination);
  return { input };
}
