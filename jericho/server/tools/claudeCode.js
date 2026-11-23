// Runs Claude Code headlessly (`claude -p`) in a project folder and reports back.
// Jobs run in the background; when one finishes, Jericho announces it out loud.
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { expandHome, settings } from "../config.js";
import { track } from "../cancel.js";
import { logAction, scrubEnvValues } from "../logger.js";
import { resolvePath } from "../pc/policy.js";
import { isSensitive } from "../secrets.js";

const cfg = settings.claudeCode || {};
const projectsDir = path.resolve(expandHome(cfg.projectsDir || "~/jericho-projects"));
export const jobEvents = new EventEmitter();
const jobs = [];
let nextId = 1;

/**
 * A plain name ("todo-app") is a project inside projectsDir. A path that starts with one of
 * the allowed PC folders ("Cheats/jericho", "Documents/site") is used as is. Nothing else.
 */
export function resolveProjectFolder(folder) {
  const name = String(folder || "").trim();
  if (!name) throw new Error("No folder given.");
  if (/[\\/]/.test(name) || name.startsWith("~") || path.isAbsolute(name)) {
    const r = resolvePath(name);
    if (!r.ok) throw new Error(r.reason);
    return r.path;
  }
  const full = path.resolve(projectsDir, name);
  if (full !== projectsDir && !full.startsWith(projectsDir + path.sep)) {
    throw new Error(`Folder must be inside ${projectsDir}.`);
  }
  return full;
}

function listProjects() {
  try {
    return fs
      .readdirSync(projectsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name);
  } catch {
    return [];
  }
}

function summarize(text) {
  const m = /SUMMARY:\s*(.+)/i.exec(text || "");
  const s = (m ? m[1] : text || "").trim().replace(/\s+/g, " ");
  return s.length > 240 ? `${s.slice(0, 237)}...` : s || "No summary.";
}

function startJob(folder, task) {
  const cwd = resolveProjectFolder(folder);
  fs.mkdirSync(cwd, { recursive: true });
  const job = { id: nextId++, folder, task, status: "running", startedAt: new Date().toISOString() };
  jobs.push(job);

  const prompt = `${task}\n\nWhen you are completely done, end your final message with one short line starting with "SUMMARY:" that says what you did, suitable for reading aloud.`;
  const args = ["-p", prompt, "--output-format", "json"];
  if (cfg.permissionMode) args.push("--permission-mode", cfg.permissionMode);
  args.push(...(cfg.extraArgs || []));

  // No shell: the task text is passed as one argument and can't inject commands.
  const child = spawn(cfg.command || "claude", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  let err = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (err += d));
  const timer = setTimeout(() => child.kill("SIGTERM"), (cfg.timeoutMinutes ?? 30) * 60_000);
  let stoppedByUser = false;
  const untrack = track("claude_code", folder, () => {
    stoppedByUser = true;
    child.kill("SIGTERM");
  });

  const finish = (status, summary, resultText = "") => {
    clearTimeout(timer);
    untrack();
    if (job.status !== "running") return;
    if (stoppedByUser) {
      status = "stopped";
      summary = "Stopped by you.";
    }
    // the result, ready to read aloud: secret-looking lines hidden
    const clean = scrubEnvValues(String(resultText).split(/\r?\n/).map((l) => (isSensitive(l) ? "[hidden]" : l)).join("\n")).trim();
    Object.assign(job, { status, summary, result: clean.length > 1500 ? `${clean.slice(-1500)}` : clean, finishedAt: new Date().toISOString() });
    if (stoppedByUser) {
      logAction("claude_code_finished", { id: job.id, folder, status });
      return; // you asked it to stop: no announcement
    }
    logAction("claude_code_finished", { id: job.id, folder, status, summary });
    const spoken =
      status === "done"
        ? `Claude Code finished in ${folder}. ${summary}`
        : `Claude Code had a problem in ${folder}. ${summary}`;
    jobEvents.emit("announce", spoken);
  };

  child.on("error", (e) =>
    finish("failed", e.code === "ENOENT" ? "The claude command isn't installed or isn't on the PATH." : e.message),
  );
  child.on("close", (code) => {
    let result = out;
    try {
      const parsed = JSON.parse(out);
      result = parsed.result ?? out;
      if (parsed.is_error) code = code || 1;
    } catch {
      /* not JSON: use raw output */
    }
    if (code === 0) finish("done", summarize(result), result);
    else finish("failed", summarize(result || err || `exit code ${code}`), result || err);
  });

  logAction("claude_code_started", { id: job.id, folder, cwd, task });
  return job;
}

export const claudeCodeTool = {
  // Claude Code edits files and can run commands, so every run needs a spoken yes.
  risky: true,
  describe: ({ folder, task }) => `run Claude Code in the "${folder}" folder to: ${task}`,
  /** Unknown or blocked folders are refused before you're asked to confirm. */
  precheck({ folder }) {
    try {
      resolveProjectFolder(folder);
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err.message };
    }
  },
  definition: {
    name: "claude_code",
    description:
      "Start Claude Code (a coding agent) to build or change a software project in a folder. " +
      "It runs in the background and Jericho announces when it finishes. Folder is a project name " +
      "inside the user's projects directory (a new name creates a new project), or a path inside an allowed folder " +
      "such as 'Cheats/jericho'. Needs the user's yes. " +
      "Pass the user's full request as the task, with any details they gave.",
    input_schema: {
      type: "object",
      properties: {
        folder: { type: "string", description: "Project folder name, e.g. 'todo-app'" },
        task: { type: "string", description: "What Claude Code should do" },
      },
      required: ["folder", "task"],
      additionalProperties: false,
    },
  },
  async run({ folder, task }) {
    const job = startJob(folder, task);
    return { ok: true, started: true, jobId: job.id, note: "Running in the background; the user will hear when it finishes." };
  },
};

export const claudeCodeStatusTool = {
  risky: false,
  definition: {
    name: "claude_code_status",
    description: "Check Claude Code jobs (running and recent) and list existing project folders.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  async run() {
    return { projectsDir, projects: listProjects(), jobs: jobs.slice(-5) };
  },
};

export const claudeCodeResultTool = {
  risky: false,
  definition: {
    name: "claude_code_result",
    description:
      "Get what a Claude Code job reported when it finished (the latest one, or a given job id), to read it aloud. " +
      "Summarise it in a few spoken sentences.",
    input_schema: { type: "object", properties: { jobId: { type: "integer" } }, additionalProperties: false },
  },
  async run({ jobId } = {}) {
    const job = jobId ? jobs.find((j) => j.id === jobId) : [...jobs].reverse().find((j) => j.status !== "running") || jobs.at(-1);
    if (!job) return { ok: false, error: "No Claude Code jobs have run yet." };
    if (job.status === "running") return { ok: true, status: "running", folder: job.folder, task: job.task, startedAt: job.startedAt };
    return { ok: true, status: job.status, folder: job.folder, task: job.task, summary: job.summary, result: job.result || job.summary };
  },
};
