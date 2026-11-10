import type { Project } from "../types";
import { fileSafe } from "../util";
import { type AudioRow, insertCopy, loadProject, loadProjectAudio } from "./db";

/**
 * Backup file (.sesproject) — one file holding the whole project:
 *
 *   "SESPROJ1" | uint32 header length | header JSON | audio file 1 | audio file 2 | …
 *
 * The header lists each audio file's id, type and byte size, in order.
 */
const MAGIC = "SESPROJ1";
export const BACKUP_EXTENSION = "sesproject";

interface BackupHeader {
  app: "Sam Eyde Studios";
  version: 1;
  savedAt: number;
  project: Project;
  audio: { id: string; mime: string; size: number }[];
}

export async function createBackup(projectId: string): Promise<{ blob: Blob; filename: string }> {
  const project = await loadProject(projectId);
  if (!project) throw new Error("Project not found");
  const rows = await loadProjectAudio(projectId);
  const used = new Set(project.tracks.map((t) => t.audioId));
  const audio = rows.filter((r) => used.has(r.id));
  const header: BackupHeader = {
    app: "Sam Eyde Studios",
    version: 1,
    savedAt: Date.now(),
    project,
    audio: audio.map((r) => ({ id: r.id, mime: r.mime, size: r.data.byteLength })),
  };
  const json = new TextEncoder().encode(JSON.stringify(header));
  const lead = new Uint8Array(MAGIC.length + 4);
  lead.set(new TextEncoder().encode(MAGIC));
  new DataView(lead.buffer).setUint32(MAGIC.length, json.length, true);
  const blob = new Blob([lead, json, ...audio.map((r) => r.data)], { type: "application/octet-stream" });
  return { blob, filename: `${fileSafe(project.name)}.${BACKUP_EXTENSION}` };
}

export async function restoreBackup(file: Blob): Promise<Project> {
  const bytes = await file.arrayBuffer();
  const lead = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, MAGIC.length));
  if (bytes.byteLength < MAGIC.length + 4 || new TextDecoder().decode(lead) !== MAGIC) {
    throw new Error("That file isn't a Sam Eyde Studios backup.");
  }
  const headerLen = new DataView(bytes).getUint32(MAGIC.length, true);
  let offset = MAGIC.length + 4;
  let header: BackupHeader;
  try {
    header = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, offset, headerLen)));
  } catch {
    throw new Error("The backup file is damaged.");
  }
  offset += headerLen;
  if (!header?.project || !Array.isArray(header.project.tracks) || !Array.isArray(header.audio)) {
    throw new Error("The backup file is damaged.");
  }
  const audio: AudioRow[] = [];
  for (const entry of header.audio) {
    if (offset + entry.size > bytes.byteLength) throw new Error("The backup file is incomplete.");
    audio.push({ id: entry.id, projectId: "", mime: entry.mime, data: bytes.slice(offset, offset + entry.size) });
    offset += entry.size;
  }
  return insertCopy(header.project, audio, header.project.name);
}
