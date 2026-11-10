import { updateTrack } from "../state/store";
import { deleteTrack } from "../studio/controller";
import type { Track } from "../types";
import { ConfirmButton } from "./ConfirmButton";
import { IconMic, IconMusic, IconTrash } from "./Icons";
import { Lane } from "./Lane";

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
    </section>
  );
}
