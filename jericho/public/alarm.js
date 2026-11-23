// The alarm ringer: a synthesized Web Audio tone (rising beeps, no audio files), louder than
// normal speech but capped at a safe maximum, with Jericho reading the label between rings.
// While you talk over it (the mic level is clearly above its own echo) the tone dips, so
// "Jericho, stop" or "snooze" can be heard.
export const ALARM_SAFE_MAX = 0.9; // master gain cap (after a limiter)
export const DEFAULT_ALARM_VOLUME = 0.85;

export function createAlarmRinger({ getCtx, ttsUrl, lang = () => "en-US" }) {
  let ringing = false;
  let ctx = null;
  let master = null;
  let target = DEFAULT_ALARM_VOLUME;
  let voice = null;
  let spoken = [];
  let calib = null; // { until, levels }
  let echo = 0;
  let duckUntil = 0;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function audible() {
    ctx = getCtx?.() || null;
    if (!ctx) return false;
    if (ctx.state !== "running") await Promise.race([ctx.resume().catch(() => {}), wait(300)]);
    return ctx.state === "running";
  }

  function beep(at, freq, len, gain) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(freq, at);
    o.frequency.linearRampToValueAtTime(freq * 1.04, at + len);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
    g.gain.setValueAtTime(gain, at + len - 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(g).connect(master);
    o.start(at);
    o.stop(at + len + 0.02);
  }

  /** Two runs of four rising beeps (about 2.3 s). Louder over the first few rings. */
  async function burst(n) {
    const t0 = ctx.currentTime + 0.05;
    const level = Math.min(1, 0.5 + n * 0.17);
    const notes = [880, 1047, 1319, 1568];
    for (let run = 0; run < 2; run++) {
      notes.forEach((f, i) => beep(t0 + run * 1.1 + i * 0.22, f, 0.16, 0.35 * level));
    }
    await wait(2300);
  }

  function say(text) {
    spoken = [...spoken.slice(-2), text];
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(done, 7000);
      try {
        voice = new Audio(ttsUrl(text));
        voice.volume = 1; // above his normal (ducked) speaking volume
        voice.onended = voice.onerror = done;
        voice.play().catch(() => {
          // ElevenLabs unavailable or blocked: the browser voice
          if (!("speechSynthesis" in window)) return done();
          const u = new SpeechSynthesisUtterance(text);
          u.lang = lang();
          u.volume = 1;
          u.onend = u.onerror = done;
          speechSynthesis.speak(u);
        });
      } catch {
        done();
      }
    });
  }

  async function loop(alarm) {
    const line = `Alarm${alarm.label ? `: ${alarm.label}` : ""}. It's ${alarm.time}.`;
    for (let n = 0; ringing; n++) {
      await burst(n);
      if (!ringing) break;
      if (n % 2 === 1) await say(line); // the label between rings
      else await wait(500);
    }
  }

  return {
    get ringing() {
      return ringing;
    },
    /** Start ringing. Resolves { audible }: false if the browser is blocking sound. */
    async start(alarm, { volume = DEFAULT_ALARM_VOLUME } = {}) {
      if (ringing) return { audible: Boolean(master) };
      ringing = true;
      spoken = [];
      target = Math.min(ALARM_SAFE_MAX, Math.max(0.2, volume));
      const ok = await audible();
      if (!ringing) return { audible: ok };
      if (!ok) return { audible: false };
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.ratio.value = 12;
      master = ctx.createGain();
      master.gain.value = target;
      master.connect(limiter).connect(ctx.destination);
      calib = { until: performance.now() + 1200, levels: [] };
      echo = 0;
      loop(alarm);
      return { audible: true };
    },
    stop() {
      ringing = false;
      calib = null;
      if (master && ctx) {
        const g = master.gain;
        g.cancelScheduledValues(ctx.currentTime);
        g.setTargetAtTime(0, ctx.currentTime, 0.02);
        const m = master;
        setTimeout(() => m.disconnect(), 300);
      }
      master = null;
      if (voice) {
        voice.pause();
        voice = null;
      }
      if ("speechSynthesis" in window) speechSynthesis.cancel();
    },
    /** What Jericho said while ringing (so it's not mistaken for you). */
    spoken: () => [...spoken],
    /**
     * Mic level while ringing: the first 1.2 s measure the alarm's own echo; after that, a level
     * clearly above it (a lower bar than interrupting speech) dips the tone so you can be heard.
     */
    level(v, now = performance.now()) {
      if (!ringing || !master || !ctx) return;
      if (calib) {
        calib.levels.push(v);
        if (now >= calib.until) {
          const s = [...calib.levels].sort((a, b) => a - b);
          echo = s[Math.floor(s.length * 0.9)] || 0;
          calib = null;
        }
        return;
      }
      if (v > Math.max(0.05, echo * 1.8) && now > duckUntil - 1200) {
        duckUntil = now + 1800;
        const g = master.gain;
        g.cancelScheduledValues(ctx.currentTime);
        g.setTargetAtTime(target * 0.2, ctx.currentTime, 0.03);
        g.setTargetAtTime(target, ctx.currentTime + 1.8, 0.2);
      }
    },
  };
}
