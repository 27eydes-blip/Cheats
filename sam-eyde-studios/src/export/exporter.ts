import type { Project } from "../types";
import { fileSafe } from "../util";
import { encodeMp3 } from "./mp3";
import { renderMix } from "./render";
import { bufferChannels, encodeWav } from "./wav";

export type ExportFormat = "wav" | "mp3";

export interface ExportResult {
  blob: Blob;
  filename: string;
  seconds: number;
}

/** Render the song (or one track) and encode it. */
export async function exportAudio(
  project: Project,
  format: ExportFormat,
  trackId: string | undefined,
  onStatus: (text: string) => void,
): Promise<ExportResult> {
  const track = trackId ? project.tracks.find((t) => t.id === trackId) : undefined;
  const title = track ? `${project.name || "Untitled"} - ${track.name || "Track"}` : project.name || "Untitled";
  onStatus("Mixing…");
  const mix = await renderMix(project, trackId);
  let blob: Blob;
  if (format === "wav") {
    onStatus("Writing WAV…");
    blob = encodeWav(bufferChannels(mix), mix.sampleRate, title);
  } else {
    blob = await encodeMp3(mix, title, (f) => onStatus(`Encoding MP3… ${Math.round(f * 100)}%`));
  }
  return { blob, filename: `${fileSafe(title)}.${format}`, seconds: mix.duration };
}
