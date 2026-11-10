import type { Project } from "../types";
import { uid } from "../util";

/** IndexedDB layout: `projects` holds the project JSON, `audio` holds every sound file. */
export interface AudioRow {
  id: string;
  projectId: string;
  mime: string;
  data: ArrayBuffer;
}

const DB_NAME = "sam-eyde-studios";
const DB_VERSION = 1;
let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
        if (!db.objectStoreNames.contains("audio")) {
          db.createObjectStore("audio", { keyPath: "id" }).createIndex("projectId", "projectId");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("Could not open storage"));
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Storage write was aborted (device may be full)"));
  });
}

export async function listProjects(): Promise<Project[]> {
  const db = await open();
  const all = await wrap<Project[]>(db.transaction("projects").objectStore("projects").getAll());
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadProject(id: string): Promise<Project | undefined> {
  const db = await open();
  return wrap<Project | undefined>(db.transaction("projects").objectStore("projects").get(id));
}

export async function saveProject(project: Project): Promise<void> {
  const db = await open();
  const tx = db.transaction("projects", "readwrite");
  tx.objectStore("projects").put(project);
  await done(tx);
}

export async function saveAudio(row: AudioRow): Promise<void> {
  const db = await open();
  const tx = db.transaction("audio", "readwrite");
  tx.objectStore("audio").put(row);
  await done(tx);
}

export async function loadProjectAudio(projectId: string): Promise<AudioRow[]> {
  const db = await open();
  return wrap<AudioRow[]>(
    db.transaction("audio").objectStore("audio").index("projectId").getAll(projectId),
  );
}

export async function deleteAudio(id: string): Promise<void> {
  const db = await open();
  const tx = db.transaction("audio", "readwrite");
  tx.objectStore("audio").delete(id);
  await done(tx);
}

export async function deleteProject(id: string): Promise<void> {
  const db = await open();
  const tx = db.transaction(["projects", "audio"], "readwrite");
  tx.objectStore("projects").delete(id);
  const index = tx.objectStore("audio").index("projectId");
  const req = index.openKeyCursor(IDBKeyRange.only(id));
  req.onsuccess = () => {
    const cursor = req.result;
    if (cursor) {
      tx.objectStore("audio").delete(cursor.primaryKey);
      cursor.continue();
    }
  };
  await done(tx);
}

/**
 * Stores a project together with its audio under fresh ids
 * (used by Duplicate and by Restore so nothing is ever overwritten).
 */
export async function insertCopy(project: Project, audio: AudioRow[], name: string): Promise<Project> {
  const now = Date.now();
  const idMap = new Map<string, string>();
  for (const row of audio) idMap.set(row.id, uid());
  const copy: Project = {
    ...project,
    id: uid(),
    name,
    createdAt: now,
    updatedAt: now,
    tracks: project.tracks.map((t) => ({ ...t, id: uid(), audioId: idMap.get(t.audioId) ?? t.audioId })),
  };
  const db = await open();
  const tx = db.transaction(["projects", "audio"], "readwrite");
  tx.objectStore("projects").put(copy);
  for (const row of audio) {
    tx.objectStore("audio").put({ ...row, id: idMap.get(row.id) as string, projectId: copy.id });
  }
  await done(tx);
  return copy;
}

export async function duplicateProject(id: string): Promise<Project | undefined> {
  const project = await loadProject(id);
  if (!project) return undefined;
  return insertCopy(project, await loadProjectAudio(id), `${project.name} copy`);
}

export async function renameProject(id: string, name: string): Promise<void> {
  const project = await loadProject(id);
  if (project) await saveProject({ ...project, name, updatedAt: Date.now() });
}

/** Ask the browser not to evict our data when the device runs low on space. */
export function requestPersistence(): void {
  try {
    void navigator.storage?.persist?.();
  } catch {
    /* not supported */
  }
}
