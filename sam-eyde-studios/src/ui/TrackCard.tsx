import { PRESET_ORDER, PRESETS } from "../effects/presets";
import { updateTrack, useStore } from "../state/store";
import { deleteTrack } from "../studio/controller";
import type { PresetId, Track } from "../types";
import { ConfirmButton } from "./ConfirmButton";
import { IconMic, IconMusic, IconTrash } from "./Icons";
import { Lane } from "./Lane";

export function retuneLabel(retune: number): string {
  if (retune >= 0.95) return "Hard";
  if (retune >= 0.7) return "Fast";
  if (retune >= 0.4) return "Medium";
  if (retune >= 0.12) return "Smooth";
  return "Natural";
}

function VocalControls({ track }: { track: Track }) {
  const tuning = useStore((s) => !!s.ui.tuning[track.id]);
  return (
    <div className="vocal-controls">
      <label className="control-row preset-row">
        <span className="slider-label wide2">Preset</span>
        <select
          value={track.preset}
          aria-label="Vocal preset"
          onChange={(e) => {
            const def = PRESETS[e.target.value as PresetId];
            // A preset also brings its own autotune defaults.
            updateTrack(track.id, { preset: def.id, autotune: def.autotune, retune: def.retune });
          }}
        >
          {PRESET_ORDER.map((id) => (
            <option key={id} value={id}>
              {PRESETS[id].name}
            </option>
          ))}
        </select>
      </label>
      <p className="hint preset-hint">{PRESETS[track.preset].blurb}</p>
      <label className="slider-row">
        <span className="slider-label wide2">FX</span>
        <input
          type="range"
          min={0}
          max={2}
          step={0.05}
          value={track.fxAmount}
          aria-label="FX amount"
          onChange={(e) => updateTrack(track.id, { fxAmount: Number(e.target.value) })}
        />
        <span className="slider-value">{Math.round(track.fxAmount * 100)}%</span>
      </label>
      <div className="control-row">
        <button
          type="button"
          className={`switch ${track.autotune ? "on" : ""}`}
          role="switch"
          aria-checked={track.autotune}
          aria-label="Autotune"
          onClick={() => updateTrack(track.id, { autotune: !track.autotune })}
        >
          <span className="switch-knob" />
        </button>
        <span className="control-title">Autotune</span>
        {tuning && (
          <span className="badge tuning" role="status">
            <span className="spinner small" /> Tuning…
          </span>
        )}
      </div>
      {track.autotune && (
        <label className="slider-row">
          <span className="slider-label wide2">Retune</span>
          <span className="slider-end">Natural</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={track.retune}
            aria-label="Retune speed"
            onChange={(e) => updateTrack(track.id, { retune: Number(e.target.value) })}
          />
          <span className="slider-end">Hard</span>
          <span className="slider-value">{retuneLabel(track.retune)}</span>
        </label>
      )}
    </div>
  );
}

export function TrackCard({ track }: { track: Track }) {
  return (
    <section className={`track ${track.kind}`} data-track-id={track.id}>
      <div className="track-head">
        <span className="track-kind" title={track.kind === "beat" ? "Beat" : "Vocal"}>
          {track.kind === "beat" ? <IconMusic /> : <IconMic />}
        </span>
        <input
          className="track-name"
          value={track.name}
          aria-label="Track name"
          maxLength={40}
          onChange={(e) => updateTrack(track.id, { name: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <button
          type="button"
          className={`chip mute ${track.muted ? "on" : ""}`}
          aria-pressed={track.muted}
          aria-label="Mute"
          onClick={() => updateTrack(track.id, { muted: !track.muted })}
        >
          M
        </button>
        <button
          type="button"
          className={`chip solo ${track.solo ? "on" : ""}`}
          aria-pressed={track.solo}
          aria-label="Solo"
          onClick={() => updateTrack(track.id, { solo: !track.solo })}
        >
          S
        </button>
        <ConfirmButton
          className="chip danger"
          label="Delete track"
          confirmLabel="Delete?"
          onConfirm={() => deleteTrack(track.id)}
        >
          <IconTrash />
        </ConfirmButton>
      </div>
      <Lane track={track} />
      <label className="slider-row">
        <span className="slider-label">Vol</span>
        <input
          type="range"
          min={0}
          max={1.5}
          step={0.01}
          value={track.volume}
          aria-label="Volume"
          onChange={(e) => updateTrack(track.id, { volume: Number(e.target.value) })}
        />
        <span className="slider-value">{Math.round(track.volume * 100)}%</span>
      </label>
      {track.kind === "vocal" && <VocalControls track={track} />}
    </section>
  );
}
