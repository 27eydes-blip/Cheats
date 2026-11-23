// Finds the `claude` command (Claude Code) and builds a safe way to run it.
// Order: claudeCode.path in settings.json -> claudeCode.command if it's a path -> PATH ->
// the usual install spots. On Windows a claude.cmd (npm install) runs through cmd.exe /c with
// every argument escaped for cmd; the task text never goes on that command line (it's sent
// on stdin), so nothing you say can become a command.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const unquote = (p) => String(p ?? "").trim().replace(/^["'](.*)["']$/, "$1").trim();

function isFile(p, exists) {
  if (exists) return exists(p);
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** The usual places Claude Code gets installed. */
export function commonClaudeSpots({ platform = process.platform, env = process.env, home = os.homedir() } = {}) {
  if (platform === "win32") {
    const w = path.win32;
    const user = env.USERPROFILE || home;
    const appData = env.APPDATA || (user && w.join(user, "AppData", "Roaming"));
    const local = env.LOCALAPPDATA || (user && w.join(user, "AppData", "Local"));
    return [
      user && w.join(user, ".local", "bin", "claude.exe"),
      appData && w.join(appData, "npm", "claude.cmd"),
      local && w.join(local, "Programs", "claude", "claude.exe"),
      local && w.join(local, "Programs", "claude", "bin", "claude.exe"),
      local && w.join(local, "Programs", "claude-code", "claude.exe"),
      user && w.join(user, ".claude", "local", "claude.exe"),
    ].filter(Boolean);
  }
  return [
    path.posix.join(home, ".local", "bin", "claude"),
    path.posix.join(home, ".claude", "local", "claude"),
    path.posix.join(home, ".npm-global", "bin", "claude"),
    "/usr/local/bin/claude",
    "/opt/homebrew/bin/claude",
  ];
}

/**
 * Where is claude? Returns { found: true, path, via } or { found: false, tried, reason }.
 * `exists` and `env`/`platform` can be passed in for tests.
 */
export function findClaude({ setting = "", command = "claude", platform = process.platform, env = process.env, home = os.homedir(), exists } = {}) {
  const p = platform === "win32" ? path.win32 : path.posix;
  const tried = [];
  const check = (file, via) => {
    tried.push(file);
    return isFile(file, exists) ? { found: true, path: file, via } : null;
  };

  const override = unquote(setting);
  if (override) {
    const full = override.replace(/^~(?=$|[\\/])/, home);
    // a folder is fine too: look for claude inside it
    const inside = platform === "win32" ? ["claude.exe", "claude.cmd"].map((n) => p.join(full, n)) : [p.join(full, "claude")];
    for (const f of [full, ...inside]) {
      const hit = check(f, "claudeCode.path");
      if (hit) return hit;
    }
    return { found: false, tried, reason: `claudeCode.path in settings.json points to "${override}", but there's no claude there` };
  }

  const cmd = unquote(command) || "claude";
  if (/[\\/]/.test(cmd)) {
    const hit = check(cmd.replace(/^~(?=$|[\\/])/, home), "claudeCode.command");
    if (hit) return hit;
  } else {
    const dirs = String(env.PATH ?? env.Path ?? "").split(platform === "win32" ? ";" : ":").map(unquote).filter(Boolean);
    const exts = platform === "win32" ? (/\.[a-z]+$/i.test(cmd) ? [""] : [".exe", ".cmd", ".bat", ...String(env.PATHEXT || "").split(";").map((e) => e.toLowerCase())]) : [""];
    for (const dir of dirs) {
      for (const ext of [...new Set(exts)].filter((e) => e !== ".com")) {
        const hit = check(p.join(dir, cmd + ext), "PATH");
        if (hit) return hit;
      }
    }
  }
  for (const spot of commonClaudeSpots({ platform, env, home })) {
    const hit = check(spot, "install folder");
    if (hit) return hit;
  }
  return { found: false, tried, reason: "the claude command isn't installed or isn't on the PATH" };
}

/** What to say when it can't be found. */
export const CLAUDE_FIX =
  "Install Claude Code (in PowerShell: irm https://claude.ai/install.ps1 | iex), then restart Jericho. " +
  "If it's installed somewhere else, set claudeCode.path in settings.json to the full path of claude.exe or claude.cmd.";

// ---- running it -----------------------------------------------------------------------------
// cmd.exe treats these specially even inside quotes; each gets a ^ in front.
const CMD_META = /([()\][%!^"`<>&|;, *?])/g;

/** One argument, quoted the way Windows programs read them, then escaped for cmd.exe. */
export function escapeCmdArg(arg, shim = true) {
  let a = String(arg);
  a = a.replace(/(\\*)"/g, '$1$1\\"'); // backslashes before a quote are doubled, the quote escaped
  a = a.replace(/(\\*)$/, "$1$1"); // trailing backslashes doubled (they sit before the closing quote)
  a = `"${a}"`;
  a = a.replace(CMD_META, "^$1");
  if (shim) a = a.replace(CMD_META, "^$1"); // a .cmd shim passes it through cmd a second time
  return a;
}

/**
 * How to spawn claude with these fixed arguments: the command, the argument array, and spawn
 * options. A .cmd or .bat goes through cmd.exe /d /s /c with a command line built only from
 * the path and the escaped fixed arguments (no shell string from user text).
 */
export function claudeSpawnSpec(found, args, { platform = process.platform, env = process.env } = {}) {
  const file = found.path;
  if (platform === "win32" && /\.(cmd|bat)$/i.test(file)) {
    const line = [file.replace(CMD_META, "^$1"), ...args.map((a) => escapeCmdArg(a))].join(" ");
    return { command: env.ComSpec || env.COMSPEC || "cmd.exe", args: ["/d", "/s", "/c", `"${line}"`], options: { windowsVerbatimArguments: true }, viaCmd: true };
  }
  return { command: file, args, options: {}, viaCmd: false };
}

/** `claude --version`, for the self-test. Resolves to the version text or throws. */
export function claudeVersion(found, { timeoutMs = 15_000 } = {}) {
  const spec = claudeSpawnSpec(found, ["--version"]);
  return new Promise((resolve, reject) => {
    let out = "";
    let err = "";
    let child;
    try {
      child = spawn(spec.command, spec.args, { ...spec.options, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      reject(e);
      return;
    }
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("it didn't answer within 15 seconds"));
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim().split(/\r?\n/)[0] || "unknown version");
      else reject(new Error((err || out).trim().split(/\r?\n/)[0] || `exit code ${code}`));
    });
  });
}
