import { useEffect, useRef } from "react";
import { updateProject, useStore } from "../state/store";
import { micLevel, startAudio, togglePlay, toggleRecord, toStart } from "../studio/controller";
import { IconMetronome, IconPause, IconPlay, IconStop, IconToStart } from "./Icons";

function InputMeter({ active }: { active: boolean }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) {
      if (bar.current) bar.current.style.transform = "scaleX(0)";
      return;
    }
    let raf = 0;
    const loop = () => {
      const level = micLevel();
      // Map -48 dB..0 dB onto the bar so quiet singing still shows clearly.
      const db = 20 * Math.log10(Math.max(level, 1e-4));
      const x = Math.max(0, Math.min(1, (db + 48) / 48));
      if (bar.current) {
        bar.current.style.transform = `scaleX(${x})`;
        bar.current.classList.toggle("hot", level > 0.89);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return (
    <div className={`meter ${active ? "active" : ""}`} aria-label="Input level" role="meter">
      <div className="meter-fill" ref={bar} />
    </div>
  );
}

export function Transport() {
  const playing = useStore((s) => s.ui.playing);
  const recording = useStore((s) => s.ui.recording);
  const countingIn = useStore((s) => s.ui.countingIn);
  const metronome = useStore((s) => s.project?.metronome ?? false);
  const countIn = useStore((s) => s.project?.countIn ?? false);

  return (
    <footer className="transport">
      <InputMeter active={recording} />
      <div className="transport-row">
        <button type="button" className="tbtn" aria-label="Back to start" onClick={toStart}>
          <IconToStart />
        </button>
        <button
          type="button"
          className="tbtn play"
          aria-label={playing ? "Pause" : "Play"}
          onClick={togglePlay}
        >
          {playing ? <IconPause /> : <IconPlay />}
        </button>
        <button
          type="button"
          className={`tbtn rec ${recording ? "on" : ""}`}
          aria-label={recording ? "Stop recording" : "Record"}
          aria-pressed={recording}
          onClick={toggleRecord}
        >
          {recording ? <IconStop /> : <span className="rec-dot" />}
        </button>
        <div className="time" aria-live="off">
          {countingIn ? (
            <span className="time-now counting">Count-in…</span>
          ) : (
            <span className="time-now" id="time-now">
              0:00.0
            </span>
          )}
          <span className="time-total" id="time-total">
            / 0:00.0
          </span>
        </div>
        <button
          type="button"
          className={`tbtn toggle ${metronome ? "on" : ""}`}
          aria-label="Metronome"
          aria-pressed={metronome}
          onClick={() => {
            startAudio();
            updateProject({ metronome: !metronome });
          }}
        >
          <IconMetronome />
        </button>
        <button
          type="button"
          className={`tbtn toggle text ${countIn ? "on" : ""}`}
          aria-label="Count-in, 1 bar"
          aria-pressed={countIn}
          onClick={() => updateProject({ countIn: !countIn })}
        >
          <span className="count-label">
            1 bar
            <small>count-in</small>
          </span>
        </button>
      </div>
    </footer>
  );
}
