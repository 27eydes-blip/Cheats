import { useState } from "react";
import { type ExportFormat, type ExportResult, exportAudio } from "../export/exporter";
import { useStore } from "../state/store";
import { startAudio } from "../studio/controller";
import { formatTime } from "../util";
import { SaveButtons } from "./SaveButtons";
import { Sheet } from "./Sheet";

export function ExportSheet({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project);
  const [what, setWhat] = useState("song");
  const [format, setFormat] = useState<ExportFormat>("wav");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  if (!project) return null;
  const working = status !== null;

  const run = async () => {
    startAudio();
    setError(null);
    setResult(null);
    setStatus("Preparing…");
    try {
      setResult(await exportAudio(project, format, what === "song" ? undefined : what, setStatus));
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setStatus(null);
    }
  };

  const reset = () => setResult(null);

  return (
    <Sheet title="Export" onClose={onClose}>
      <label className="field">
        <span className="field-label">What</span>
        <select
          value={what}
          aria-label="What to export"
          disabled={working}
          onChange={(e) => {
            setWhat(e.target.value);
            reset();
          }}
        >
          <option value="song">Full song (all tracks)</option>
          {project.tracks.map((t) => (
            <option key={t.id} value={t.id}>
              Only: {t.name || "Track"}
            </option>
          ))}
        </select>
      </label>
      <div className="segmented" role="group" aria-label="Format">
        {(["wav", "mp3"] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={format === f ? "on" : ""}
            aria-pressed={format === f}
            disabled={working}
            onClick={() => {
              setFormat(f);
              reset();
            }}
          >
            {f === "wav" ? "WAV · best quality" : "MP3 · small file"}
          </button>
        ))}
      </div>
      <p className="hint">
        Rendered with the same effects you hear in the studio, plus a 3-second tail so reverb rings out.
      </p>

      {!result && (
        <button
          type="button"
          className="btn primary block big"
          data-export-run
          disabled={working || project.tracks.length === 0}
          onClick={run}
        >
          {working ? (
            <>
              <span className="spinner" /> {status}
            </>
          ) : (
            "Export"
          )}
        </button>
      )}
      {error && <p className="error">{error}</p>}
      {result && (
        <SaveButtons blob={result.blob} filename={result.filename} detail={formatTime(result.seconds)} />
      )}
    </Sheet>
  );
}
