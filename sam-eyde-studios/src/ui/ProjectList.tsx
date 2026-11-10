import { useCallback, useEffect, useState } from "react";
import { toast } from "../state/store";
import { createBackup, restoreBackup } from "../storage/backup";
import * as db from "../storage/db";
import { createProject, openProject } from "../studio/session";
import { projectDuration } from "../studio/timeline";
import type { Project } from "../types";
import { formatTime } from "../util";
import { ConfirmButton } from "./ConfirmButton";
import { IconMore, IconPlus } from "./Icons";
import { Logo } from "./Logo";
import { SaveButtons } from "./SaveButtons";
import { Sheet } from "./Sheet";

function when(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? `Today ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export function ProjectList() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [backup, setBackup] = useState<{ blob: Blob; filename: string } | "working" | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setProjects(await db.listProjects());
    } catch (err) {
      console.error(err);
      setProjects([]);
      toast("Storage isn't available in this browser mode (private browsing?).", 6000);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const guard = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      console.error(err);
      toast(err instanceof Error ? err.message : "Something went wrong.", 5000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="projects">
      <header className="projects-head">
        <Logo />
        <p className="projects-sub">Your private recording studio</p>
      </header>

      <div className="projects-actions">
        <button
          type="button"
          className="btn primary big"
          data-new-project
          onClick={() => {
            db.requestPersistence();
            void guard(createProject);
          }}
        >
          <IconPlus /> New project
        </button>
        <label className="btn big">
          Restore backup
          <input
            type="file"
            hidden
            data-restore
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              void guard(async () => {
                const p = await restoreBackup(file);
                await reload();
                toast(`Restored “${p.name}”`);
              });
            }}
          />
        </label>
      </div>

      {projects === null ? (
        <p className="projects-empty">Loading…</p>
      ) : projects.length === 0 ? (
        <p className="projects-empty">No projects yet. Tap “New project” to start your first song.</p>
      ) : (
        <ul className="project-list">
          {projects.map((p) => (
            <li key={p.id} className="project-item" data-project-id={p.id}>
              <div className="project-row">
                <button type="button" className="project-open" onClick={() => void guard(() => openProject(p.id))}>
                  <span className="project-title">{p.name || "Untitled"}</span>
                  <span className="project-meta">
                    {p.tracks.length} {p.tracks.length === 1 ? "track" : "tracks"} · {formatTime(projectDuration(p))} ·{" "}
                    {p.bpm} BPM · {when(p.updatedAt)}
                  </span>
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Options for ${p.name}`}
                  aria-expanded={menu === p.id}
                  onClick={() => setMenu(menu === p.id ? null : p.id)}
                >
                  <IconMore />
                </button>
              </div>
              {menu === p.id && (
                <div className="project-menu">
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => {
                      setRenaming(p);
                      setName(p.name);
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() =>
                      void guard(async () => {
                        await db.duplicateProject(p.id);
                        await reload();
                      })
                    }
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => {
                      setBackup("working");
                      void guard(async () => {
                        try {
                          setBackup(await createBackup(p.id));
                        } catch (err) {
                          setBackup(null);
                          throw err;
                        }
                      });
                    }}
                  >
                    Back up
                  </button>
                  <ConfirmButton
                    className="btn small danger"
                    label="Delete project"
                    confirmLabel="Tap again to delete"
                    onConfirm={() =>
                      void guard(async () => {
                        await db.deleteProject(p.id);
                        setMenu(null);
                        await reload();
                      })
                    }
                  >
                    Delete
                  </ConfirmButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="projects-foot">
        Everything is stored on this device only. Back up projects you care about, and add the app to your Home
        Screen so iOS keeps your recordings.
      </p>

      {renaming && (
        <Sheet title="Rename project" onClose={() => setRenaming(null)}>
          <form
            className="rename-form"
            onSubmit={(e) => {
              e.preventDefault();
              const target = renaming;
              setRenaming(null);
              void guard(async () => {
                await db.renameProject(target.id, name.trim() || "Untitled");
                await reload();
              });
            }}
          >
            <input
              className="text-input"
              value={name}
              aria-label="New name"
              maxLength={60}
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
            <button type="submit" className="btn primary block big">
              Save
            </button>
          </form>
        </Sheet>
      )}

      {backup && (
        <Sheet title="Back up project" onClose={() => setBackup(null)}>
          {backup === "working" ? (
            <p className="hint">
              <span className="spinner" /> Packing your project…
            </p>
          ) : (
            <>
              <p className="hint">
                One file with the whole project, audio included. Open it on another device with “Restore backup”.
              </p>
              <SaveButtons blob={backup.blob} filename={backup.filename} />
            </>
          )}
        </Sheet>
      )}
    </div>
  );
}
