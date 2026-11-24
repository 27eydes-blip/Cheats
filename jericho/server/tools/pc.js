// PC control: apps, links, volume, media keys, timers, clipboard and files, Windows first.
//
// Safety:
//  - Tiers (see server/pc/policy.js): safe tools run at once; write/move/delete/run_command read
//    back exactly what will happen and need your spoken yes; anything outside the allowed
//    folders, system/registry/security changes and secret files are blocked.
//  - PowerShell scripts below are fixed text. Anything from your words reaches them only as
//    environment variables (JERICHO_ARG0, ...), which PowerShell treats as plain data, never
//    as code. Other programs get argument arrays, never a shell string.
//  - Child processes never see Jericho's keys, and their output is scrubbed before it's spoken
//    or logged.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../config.js";
import { logAction, scrubEnvValues } from "../logger.js";
import { track } from "../cancel.js";
import { isSensitive } from "../secrets.js";
import { allowedRoots, checkApp, checkCommand, checkUrl, friendly, isSecretPath, pcSettings, resolvePath } from "../pc/policy.js";
import { jobEvents } from "./claudeCode.js";

const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";

/** Jericho's environment minus every key and private value. */
export function cleanEnv(extra = {}) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (/^(ANTHROPIC_|ELEVENLABS_|TWILIO_|JERICHO_ACCESS_TOKEN$|MY_PHONE_NUMBER$|JARVIS_ACCESS_TOKEN$|CALENDAR_ICS_URL$|ROKU_IP$)/i.test(k)) delete env[k];
  }
  return { ...env, ...extra };
}

/** Scrub text that's about to be spoken or logged: lines that look secret, and any .env value. */
function scrub(text, max = 2000) {
  const lines = String(text || "").split(/\r?\n/).map((l) => (isSensitive(l) ? "[hidden: looked like a secret]" : l));
  const out = scrubEnvValues(lines.join("\n"));
  return out.length > max ? `${out.slice(0, max)}\n[...cut short]` : out;
}

/**
 * Runs a program with an argument array (no shell), stoppable by the kill switch.
 * Resolves { code, stdout, stderr, timedOut, stopped }.
 */
function run(cmd, args, { env, cwd, timeoutMs = 20_000, label = cmd, signal, input } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      // its own process group (macOS/Linux), so stopping it also stops anything it started
      child = spawn(cmd, args, { env: env || cleanEnv(), cwd, windowsHide: true, shell: false, stdio: ["pipe", "pipe", "pipe"], detached: !isWin });
    } catch (err) {
      resolve({ code: -1, stdout: "", stderr: err.message });
      return;
    }
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let stopped = false;
    // Stop the whole tree: a command's own child processes (npm -> node, sh -> sleep) go too.
    const kill = () => {
      try {
        if (isWin) spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        else process.kill(-child.pid, "SIGTERM");
      } catch {
        try {
          child.kill();
        } catch {
          /* already gone */
        }
      }
    };
    const untrack = track("command", label, () => {
      stopped = true;
      kill();
    });
    const onAbort = () => {
      stopped = true;
      kill();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
    const done = (code) => {
      clearTimeout(timer);
      untrack();
      signal?.removeEventListener("abort", onAbort);
      resolve({ code, stdout, stderr, timedOut, stopped });
    };
    child.on("error", (err) => {
      stderr += err.message;
      done(-1);
    });
    child.on("close", (code) => done(code));
  });
}

/** A fixed PowerShell script; user values only as $env:JERICHO_ARG0, $env:JERICHO_ARG1, ... */
function powershell(script, args = [], opts = {}) {
  const env = cleanEnv(Object.fromEntries(args.map((a, i) => [`JERICHO_ARG${i}`, String(a)])));
  return run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], { ...opts, env });
}

function failed(r, what) {
  if (r.stopped) return { ok: false, error: "Stopped." };
  if (r.timedOut) return { ok: false, error: `${what} took too long, so I stopped it.` };
  return { ok: false, error: `${what} didn't work: ${scrub(r.stderr || r.stdout, 300) || `exit code ${r.code}`}` };
}

function pcLog(tool, tier, details) {
  logAction("pc_action", { tool, tier, ...details });
}

const obj = (props, required = Object.keys(props)) => ({ type: "object", properties: props, required, additionalProperties: false });

// ---- safe: runs straight away --------------------------------------------------------------

export const openAppTool = {
  risky: false,
  definition: {
    name: "open_app",
    description: "Open an app on the PC by name, e.g. Spotify, Notepad, Calculator, Chrome, VS Code.",
    input_schema: obj({ name: { type: "string" } }),
  },
  async run({ name }, ctx = {}) {
    const check = checkApp(name);
    if (!check.ok) return { ok: false, error: check.reason };
    const friendlyNames = { calculator: "calc", "vs code": "code", vscode: "code", edge: "msedge", "file explorer": "explorer" };
    const target = friendlyNames[check.target.toLowerCase()] || check.target;
    let r;
    if (isWin) r = await powershell("Start-Process -FilePath $env:JERICHO_ARG0", [target], { signal: ctx.signal, label: `open ${target}` });
    else if (isMac) r = await run("open", ["-a", target], { signal: ctx.signal });
    else r = await run("xdg-open", [target], { signal: ctx.signal });
    pcLog("open_app", "safe", { app: target, ok: r.code === 0 });
    return r.code === 0 ? { ok: true, opened: target } : failed(r, `Opening ${name}`);
  },
};

export const openUrlTool = {
  risky: false,
  definition: {
    name: "open_url",
    description: "Open a web page in the default browser. http or https only.",
    input_schema: obj({ url: { type: "string" } }),
  },
  async run({ url }, ctx = {}) {
    const check = checkUrl(url);
    if (!check.ok) return { ok: false, error: check.reason };
    let r;
    if (isWin) r = await powershell("Start-Process -FilePath $env:JERICHO_ARG0", [check.url], { signal: ctx.signal, label: "open link" });
    else r = await run(isMac ? "open" : "xdg-open", [check.url], { signal: ctx.signal });
    pcLog("open_url", "safe", { host: new URL(check.url).host, ok: r.code === 0 });
    return r.code === 0 ? { ok: true, opened: new URL(check.url).host } : failed(r, "Opening the link");
  },
};

export const setVolumeTool = {
  risky: false,
  definition: {
    name: "set_volume",
    description: "Set the PC's volume to a percentage, turn it up or down a step (step), or mute/unmute.",
    input_schema: obj({ percent: { type: "integer", minimum: 0, maximum: 100 }, mute: { type: "boolean" }, step: { type: "string", enum: ["up", "down"] } }, []),
  },
  async run({ percent, mute, step }, ctx = {}) {
    if (!isWin) return { ok: false, error: "Volume control is only set up for Windows so far." };
    // Volume keys move in 2% steps: go to zero, then up to the level asked for.
    // A step up or down is five key presses (about 10%).
    const script = [
      "$w = New-Object -ComObject WScript.Shell",
      "if ($env:JERICHO_ARG1 -eq 'mute') { $w.SendKeys([char]173); exit 0 }",
      "if ($env:JERICHO_ARG2 -eq 'up') { 1..5 | ForEach-Object { $w.SendKeys([char]175) }; exit 0 }",
      "if ($env:JERICHO_ARG2 -eq 'down') { 1..5 | ForEach-Object { $w.SendKeys([char]174) }; exit 0 }",
      "1..50 | ForEach-Object { $w.SendKeys([char]174) }",
      "$n = [int]([int]$env:JERICHO_ARG0 / 2)",
      "if ($n -gt 0) { 1..$n | ForEach-Object { $w.SendKeys([char]175) } }",
    ].join("; ");
    const level = Math.max(0, Math.min(100, Math.round(Number(percent ?? 50))));
    const dir = !mute && (step === "up" || step === "down") ? step : "";
    const r = await powershell(script, [level, mute ? "mute" : "", dir], { signal: ctx.signal, label: "volume" });
    const what = mute ? "mute toggled" : dir ? `turned ${dir}` : level;
    pcLog("set_volume", "safe", { level: what, ok: r.code === 0 });
    return r.code === 0 ? { ok: true, volume: what } : failed(r, "Changing the volume");
  },
};

const MEDIA_KEYS = { play_pause: 179, next: 176, previous: 177, stop: 178 };
export const mediaControlTool = {
  risky: false,
  definition: {
    name: "media_control",
    description: "Press a media key: play/pause, next track, previous track or stop. Works with Spotify, YouTube and most players.",
    input_schema: obj({ action: { type: "string", enum: Object.keys(MEDIA_KEYS) } }),
  },
  async run({ action }, ctx = {}) {
    if (!isWin) return { ok: false, error: "Media keys are only set up for Windows so far." };
    const r = await powershell("(New-Object -ComObject WScript.Shell).SendKeys([char][int]$env:JERICHO_ARG0)", [MEDIA_KEYS[action]], { signal: ctx.signal, label: "media key" });
    pcLog("media_control", "safe", { action, ok: r.code === 0 });
    return r.code === 0 ? { ok: true, pressed: action } : failed(r, "The media key");
  },
};

const timers = new Map();
let timerId = 1;
export const setTimerTool = {
  risky: false,
  definition: {
    name: "set_timer",
    description: "Set a timer. Jericho says so out loud when it's done.",
    input_schema: obj({ minutes: { type: "number", minimum: 0.05, maximum: 1440 }, label: { type: "string" } }, ["minutes"]),
  },
  async run({ minutes, label }) {
    const ms = Math.round(Math.max(0.05, Math.min(1440, Number(minutes))) * 60_000);
    const id = timerId++;
    const what = String(label || "").slice(0, 60);
    const handle = setTimeout(() => {
      timers.delete(id);
      untrack();
      pcLog("set_timer", "safe", { id, finished: true });
      jobEvents.emit("announce", what ? `Your ${what} timer is done.` : "Your timer is done.");
    }, ms);
    const untrack = track("timer", what || `${minutes} minute timer`, () => {
      clearTimeout(handle);
      timers.delete(id);
    });
    timers.set(id, { handle, endsAt: Date.now() + ms, label: what });
    pcLog("set_timer", "safe", { id, minutes: ms / 60_000 });
    return { ok: true, id, minutes: ms / 60_000, label: what };
  },
};

export const readClipboardTool = {
  risky: false,
  definition: {
    name: "read_clipboard",
    description: "Read the text on the clipboard. Anything that looks like a password, key or card number is hidden.",
    input_schema: obj({}),
  },
  async run(_input, ctx = {}) {
    let r;
    if (isWin) r = await powershell("Get-Clipboard -Raw", [], { signal: ctx.signal, label: "clipboard" });
    else if (isMac) r = await run("pbpaste", [], { signal: ctx.signal });
    else r = await run("xclip", ["-selection", "clipboard", "-o"], { signal: ctx.signal });
    pcLog("read_clipboard", "safe", { ok: r.code === 0, chars: r.stdout.length });
    if (r.code !== 0) return failed(r, "Reading the clipboard");
    return { ok: true, text: scrub(r.stdout.trim(), 1500) || "(the clipboard is empty)" };
  },
};

export const writeClipboardTool = {
  risky: false,
  definition: {
    name: "write_clipboard",
    description: "Put text on the clipboard so the user can paste it.",
    input_schema: obj({ text: { type: "string" } }),
  },
  async run({ text }, ctx = {}) {
    if (isSensitive(text)) return { ok: false, error: "That looks like a password or key, so I won't put it on the clipboard." };
    let r;
    if (isWin) r = await powershell("Set-Clipboard -Value $env:JERICHO_ARG0", [text], { signal: ctx.signal, label: "clipboard" });
    else if (isMac) r = await run("pbcopy", [], { signal: ctx.signal, input: text });
    else r = await run("xclip", ["-selection", "clipboard"], { signal: ctx.signal, input: text });
    pcLog("write_clipboard", "safe", { ok: r.code === 0, chars: String(text).length });
    return r.code === 0 ? { ok: true, copied: String(text).length } : failed(r, "Writing to the clipboard");
  },
};

export const listDirTool = {
  risky: false,
  definition: {
    name: "list_dir",
    description: "List what's in a folder. Paths start with an allowed folder, e.g. 'Desktop', 'Documents/taxes', 'Cheats/jericho'.",
    input_schema: obj({ path: { type: "string" } }),
  },
  async run({ path: p }) {
    const r = resolvePath(p, { mustExist: true });
    if (!r.ok) return { ok: false, error: r.reason };
    if (!fs.statSync(r.path).isDirectory()) return { ok: false, error: `${r.display} is a file, not a folder.` };
    const entries = fs
      .readdirSync(r.path, { withFileTypes: true })
      .filter((d) => !isSecretPath(path.join(r.path, d.name)))
      .slice(0, 100)
      .map((d) => {
        let size;
        let modified;
        try {
          const st = fs.statSync(path.join(r.path, d.name));
          size = d.isDirectory() ? undefined : st.size;
          modified = st.mtime.toISOString().slice(0, 10);
        } catch {
          /* unreadable */
        }
        return { name: d.name, type: d.isDirectory() ? "folder" : "file", size, modified };
      });
    pcLog("list_dir", "safe", { path: r.display, entries: entries.length });
    return { ok: true, folder: r.display, entries };
  },
};

export const readFileTool = {
  risky: false,
  definition: {
    name: "read_file",
    description: "Read a text file in an allowed folder. Secret files (.env, keys) are blocked, and secret-looking lines are hidden.",
    input_schema: obj({ path: { type: "string" } }),
  },
  async run({ path: p }) {
    const r = resolvePath(p, { mustExist: true });
    if (!r.ok) return { ok: false, error: r.reason };
    const st = fs.statSync(r.path);
    if (st.isDirectory()) return { ok: false, error: `${r.display} is a folder. Use list_dir.` };
    const max = pcSettings().maxReadKB * 1024;
    const buf = fs.readFileSync(r.path).subarray(0, max);
    if (buf.includes(0)) return { ok: false, error: `${r.display} isn't a text file.` };
    pcLog("read_file", "safe", { path: r.display, bytes: buf.length });
    return { ok: true, file: r.display, text: scrub(buf.toString("utf8"), 6000), truncated: st.size > max };
  },
};

export const searchFilesTool = {
  risky: false,
  definition: {
    name: "search_files",
    description: "Find files whose names contain some words, in the allowed folders (or one of them).",
    input_schema: obj({ query: { type: "string" }, folder: { type: "string" } }, ["query"]),
  },
  async run({ query, folder }) {
    const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return { ok: false, error: "What should I look for?" };
    let starts = allowedRoots();
    if (folder) {
      const r = resolvePath(folder, { mustExist: true });
      if (!r.ok) return { ok: false, error: r.reason };
      starts = [r.path];
    }
    const found = [];
    let visited = 0;
    const queue = starts.map((d) => ({ dir: d, depth: 0 }));
    while (queue.length && found.length < 30 && visited < 5000) {
      const { dir, depth } = queue.shift();
      visited++;
      let list = [];
      try {
        list = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const d of list) {
        const full = path.join(dir, d.name);
        if (isSecretPath(full) || d.name === "node_modules" || d.name.startsWith(".")) continue;
        if (words.every((w) => d.name.toLowerCase().includes(w))) found.push({ path: friendly(full), type: d.isDirectory() ? "folder" : "file" });
        if (d.isDirectory() && depth < 6) queue.push({ dir: full, depth: depth + 1 });
      }
    }
    pcLog("search_files", "safe", { results: found.length });
    return { ok: true, results: found };
  },
};

// ---- confirm: read back exactly what will happen, then wait for a yes -----------------------

const lineCount = (t) => String(t).split(/\r?\n/).length;

export const writeFileTool = {
  risky: true,
  precheck(input) {
    const r = resolvePath(input.path);
    if (!r.ok) return { ok: false, reason: r.reason };
    if (fs.existsSync(r.path) && fs.statSync(r.path).isDirectory()) return { ok: false, reason: `${r.display} is a folder.` };
    if (isSensitive(input.content)) return { ok: false, reason: "That text looks like a password or key, so I won't write it to a file." };
    return { ok: true };
  },
  confirmPrompt({ path: p, content, mode = "overwrite" }) {
    const r = resolvePath(p);
    const exists = r.ok && fs.existsSync(r.path);
    const start = String(content).trim().split(/\r?\n/)[0].slice(0, 60);
    const how = mode === "append" ? `add ${lineCount(content)} line${lineCount(content) === 1 ? "" : "s"} to the end of ${r.display}` : exists ? `replace everything in ${r.display} with ${lineCount(content)} new line${lineCount(content) === 1 ? "" : "s"}` : `create ${r.display} with ${lineCount(content)} line${lineCount(content) === 1 ? "" : "s"}`;
    return `Should I ${how}? It starts: "${start}".`;
  },
  describe: ({ path: p }) => `write to ${p}`,
  definition: {
    name: "write_file",
    description: "Create or change a text file in an allowed folder. Needs the user's yes.",
    input_schema: obj({ path: { type: "string" }, content: { type: "string" }, mode: { type: "string", enum: ["overwrite", "append"] } }, ["path", "content"]),
  },
  async run({ path: p, content, mode = "overwrite" }) {
    const check = this.precheck({ path: p, content });
    if (!check.ok) return { ok: false, error: check.reason };
    const r = resolvePath(p);
    fs.mkdirSync(path.dirname(r.path), { recursive: true });
    if (mode === "append") fs.appendFileSync(r.path, content);
    else fs.writeFileSync(r.path, content);
    pcLog("write_file", "confirm", { path: r.display, mode, chars: String(content).length });
    return { ok: true, wrote: r.display, mode };
  },
};

export const moveFileTool = {
  risky: true,
  precheck({ from, to }) {
    const a = resolvePath(from, { mustExist: true });
    if (!a.ok) return { ok: false, reason: a.reason };
    const b = resolvePath(to);
    if (!b.ok) return { ok: false, reason: b.reason };
    if (fs.existsSync(b.path)) return { ok: false, reason: `${b.display} already exists, and I won't overwrite it.` };
    return { ok: true };
  },
  confirmPrompt({ from, to }) {
    return `Should I move ${resolvePath(from).display} to ${resolvePath(to).display}?`;
  },
  describe: ({ from, to }) => `move ${from} to ${to}`,
  definition: {
    name: "move_file",
    description: "Move or rename a file or folder within the allowed folders. Never overwrites. Needs the user's yes.",
    input_schema: obj({ from: { type: "string" }, to: { type: "string" } }),
  },
  async run({ from, to }) {
    const check = this.precheck({ from, to });
    if (!check.ok) return { ok: false, error: check.reason };
    const a = resolvePath(from);
    const b = resolvePath(to);
    fs.mkdirSync(path.dirname(b.path), { recursive: true });
    fs.renameSync(a.path, b.path);
    pcLog("move_file", "confirm", { from: a.display, to: b.display });
    return { ok: true, moved: a.display, to: b.display };
  },
};

export const deleteFileTool = {
  risky: true,
  precheck({ path: p }) {
    const r = resolvePath(p, { mustExist: true });
    if (!r.ok) return { ok: false, reason: r.reason };
    if (allowedRoots().some((root) => root.toLowerCase() === r.path.toLowerCase())) return { ok: false, reason: "I won't delete one of the allowed folders itself." };
    return { ok: true };
  },
  confirmPrompt({ path: p }) {
    const r = resolvePath(p);
    let what = r.display;
    try {
      if (fs.statSync(r.path).isDirectory()) what = `the folder ${r.display} and the ${fs.readdirSync(r.path).length} things in it`;
    } catch {
      /* checked again before running */
    }
    return `Should I move ${what} to the Recycle Bin? You can restore it from there.`;
  },
  describe: ({ path: p }) => `delete ${p}`,
  definition: {
    name: "delete_file",
    description: "Delete a file or folder in an allowed folder by sending it to the Recycle Bin (never permanently). Needs the user's yes.",
    input_schema: obj({ path: { type: "string" } }),
  },
  async run({ path: p }, ctx = {}) {
    const check = this.precheck({ path: p });
    if (!check.ok) return { ok: false, error: check.reason };
    const r = resolvePath(p);
    const isDir = fs.statSync(r.path).isDirectory();
    if (isWin) {
      const script = [
        "Add-Type -AssemblyName Microsoft.VisualBasic",
        "if ($env:JERICHO_ARG1 -eq 'dir') { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($env:JERICHO_ARG0, 'OnlyErrorDialogs', 'SendToRecycleBin') }",
        "else { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($env:JERICHO_ARG0, 'OnlyErrorDialogs', 'SendToRecycleBin') }",
      ].join("; ");
      const res = await powershell(script, [r.path, isDir ? "dir" : "file"], { signal: ctx.signal, label: "recycle" });
      if (res.code !== 0) return failed(res, "Sending it to the Recycle Bin");
    } else {
      // No Recycle Bin here: move it into Jericho's own trash folder instead (never a permanent delete).
      const trash = path.join(process.env.JERICHO_DATA_DIR || path.join(ROOT, "data"), "trash");
      fs.mkdirSync(trash, { recursive: true });
      fs.renameSync(r.path, path.join(trash, `${Date.now()}-${path.basename(r.path)}`));
    }
    pcLog("delete_file", "confirm", { path: r.display, to: isWin ? "Recycle Bin" : "data/trash" });
    return { ok: true, recycled: r.display };
  },
};

export const runCommandTool = {
  risky: true,
  precheck({ command, folder }) {
    const c = checkCommand(command);
    if (!c.ok) return { ok: false, reason: c.reason };
    if (folder) {
      const r = resolvePath(folder, { mustExist: true });
      if (!r.ok) return { ok: false, reason: r.reason };
    }
    return { ok: true };
  },
  confirmPrompt({ command, folder }) {
    const where = folder ? resolvePath(folder).display : path.basename(allowedRoots().at(-1));
    return `Should I run this command in ${where}: ${String(command).trim()}?`;
  },
  describe: ({ command }) => `run ${command}`,
  definition: {
    name: "run_command",
    description:
      "Run one PowerShell command in an allowed folder (default: the Cheats folder). Needs the user's yes; the exact command is read back first. " +
      "System, registry and security changes, recursive deletes and anything touching secrets are blocked.",
    input_schema: obj({ command: { type: "string" }, folder: { type: "string" } }, ["command"]),
  },
  async run({ command, folder }, ctx = {}) {
    const check = this.precheck({ command, folder });
    if (!check.ok) return { ok: false, error: check.reason };
    const cwd = folder ? resolvePath(folder).path : allowedRoots().at(-1);
    const timeoutMs = pcSettings().commandTimeoutSeconds * 1000;
    // The confirmed command is passed as a single argument, exactly as read back.
    const r = isWin
      ? await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", String(command)], { cwd, timeoutMs, signal: ctx.signal, label: "command" })
      : await run("sh", ["-c", String(command)], { cwd, timeoutMs, signal: ctx.signal, label: "command" });
    pcLog("run_command", "confirm", { folder: friendly(cwd), exitCode: r.code, stopped: r.stopped, timedOut: r.timedOut });
    if (r.stopped || r.timedOut) return failed(r, "The command");
    return { ok: r.code === 0, exitCode: r.code, output: scrub(r.stdout, 1500), errors: scrub(r.stderr, 600) };
  },
};

export const pcTools = [
  openAppTool,
  openUrlTool,
  setVolumeTool,
  mediaControlTool,
  setTimerTool,
  readClipboardTool,
  writeClipboardTool,
  listDirTool,
  readFileTool,
  searchFilesTool,
  writeFileTool,
  moveFileTool,
  deleteFileTool,
  runCommandTool,
];

/** For the Control section: the allowed folders as you'd say them. */
export function controlInfo() {
  return {
    allowedFolders: allowedRoots().map((r) => ({ name: path.basename(r), path: scrubEnvValues(r) })),
    safe: ["open_app", "open_url", "set_volume", "media_control", "set_timer", "read_clipboard", "write_clipboard", "list_dir", "read_file", "search_files", "claude_code_status", "claude_code_result"],
    confirm: ["write_file", "move_file", "delete_file (to the Recycle Bin)", "run_command", "claude_code", "make_call"],
    blocked: ["anything outside the allowed folders", "system, registry and security changes", ".env, keys and other secret files"],
  };
}
