import { useState } from "react";
import { canShareFile, downloadBlob, shareBlob } from "../export/save";

/** "Your file is ready" block: Save (download) and, where supported, the share sheet. */
export function SaveButtons({ blob, filename, detail }: { blob: Blob; filename: string; detail?: string }) {
  const [error, setError] = useState<string | null>(null);
  const size = `${(blob.size / 1048576).toFixed(1)} MB`;
  return (
    <div className="export-done">
      <p className="export-file">
        <b>{filename}</b>
        <span>{detail ? `${detail} · ${size}` : size}</span>
      </p>
      <button
        type="button"
        className="btn primary block big"
        data-export-save
        onClick={() => downloadBlob(blob, filename)}
      >
        Save file
      </button>
      {canShareFile(blob, filename) && (
        <button
          type="button"
          className="btn block big"
          onClick={() => void shareBlob(blob, filename).catch(() => setError("Sharing failed"))}
        >
          Share…
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
