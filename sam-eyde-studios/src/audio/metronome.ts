/** Schedules short click sounds. Clicks go straight to the speakers, never into exports. */
export class Metronome {
  private out: GainNode;

  constructor(private ctx: AudioContext) {
    this.out = ctx.createGain();
    this.out.gain.value = 0.5;
    this.out.connect(ctx.destination);
  }

  click(time: number, accent: boolean): void {
    const ctx = this.ctx;
    const t = Math.max(time, ctx.currentTime);
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = accent ? 1760 : 1175;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(accent ? 0.9 : 0.55, t + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    osc.connect(env).connect(this.out);
    osc.start(t);
    osc.stop(t + 0.06);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
  }
}
