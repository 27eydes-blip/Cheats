import { decodeAudio } from "../audio/decode";
import { engine } from "../audio/engine";
import { resetAutotune } from "../autotune/manager";
import { bufferChannels, encodeWav } from "../export/wav";
import { getState, initialUi, newProject, setState, setUi, subscribe, toast } from "../state/store";
import * as db from "../storage/db";
import type { Project } from "../types";
import { peaks, registerAudio, setAudioHooks, startAudio, stopEverything } from "./controller";

/**
 * Project session: opening / closing projects and autosaving every change.
 */

const SAVE_DELAY_MS = 400;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let lastSaved: Project | null = null;
let saving: Promise<void> = Promise.resolve();

function scheduleSave(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flushSave(), SAVE_DELAY_MS);
}

/** Write the open project to storage now. */
export function flushSave(): Promise<void> {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  const project = getState().project;
  if (!project || project === lastSaved) return saving;
  lastSaved = project;
  saving = saving
    .then(() => db.saveProject(project))
    .catch((err) => {
      console.error(err);
      lastSaved = null;
      toast("Couldn't save — your device storage may be full.", 6000);
    });
  return saving;
}

subscribe(() => {
  const { project, screen } = getState();
  if (screen === "studio" && project && project !== lastSaved) scheduleSave();
});

// Never lose the last edits when the app is backgrounded or closed.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushSave();
  });
  window.addEventListener("pagehide", () => void flushSave());
}

// Audio is written to storage the moment it is imported or recorded.
setAudioHooks({
  async imported(audioId, data, mime) {
    const project = getState().project;
    if (project) await db.saveAudio({ id: audioId, projectId: project.id, mime, data });
  },
  async recorded(audioId, buffer) {
    const project = getState().project;
    if (!project) return;
    // Takes are stored as WAV so a backup opens on any device.
    const wav = await encodeWav(bufferChannels(buffer), buffer.sampleRate).arrayBuffer();
    await db.saveAudio({ id: audioId, projectId: project.id, mime: "audio/wav", data: wav });
  },
  async removed(audioId) {
    await db.deleteAudio(audioId);
  },
});

function resetAudio(): void {
  stopEverything();
  engine.reset();
  resetAutotune();
  peaks.clear();
}

/** Must be called from a tap (it starts the AudioContext). */
export async function openProject(id: string): Promise<void> {
  const ctx = startAudio();
  const project = await db.loadProject(id);
  if (!project) {
    toast("That project could not be found.");
    return;
  }
  resetAudio();
  lastSaved = project;
  setState({
    screen: "studio",
    project,
    ui: { ...initialUi, audioStarted: true, laneWidth: getState().ui.laneWidth, loading: true },
  });
  try {
    const rows = await db.loadProjectAudio(id);
    let failed = 0;
    await Promise.all(
      rows.map(async (row) => {
        try {
          const buffer = await decodeAudio(ctx, row.data);
          if (getState().project?.id === id) registerAudio(row.id, buffer);
        } catch (err) {
          console.error(err);
          failed++;
        }
      }),
    );
    const missing = project.tracks.filter((t) => !rows.some((r) => r.id === t.audioId)).length;
    if (failed || missing) toast(`${failed + missing} audio file(s) could not be loaded.`, 6000);
  } finally {
    if (getState().project?.id === id) setUi({ loading: false });
  }
}

export async function createProject(): Promise<void> {
  startAudio();
  const existing = await db.listProjects();
  const project = newProject(`Song ${existing.length + 1}`);
  await db.saveProject(project);
  await openProject(project.id);
}

export async function closeProject(): Promise<void> {
  stopEverything();
  await flushSave();
  resetAudio();
  lastSaved = null;
  setState({ screen: "projects", project: null, ui: { ...initialUi, audioStarted: getState().ui.audioStarted } });
}
