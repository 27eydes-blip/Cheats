// `npm run start:safe`: runs the Jericho server and starts it again if it stops unexpectedly,
// up to 5 times (the count resets after 10 minutes of running fine). Each restart is logged to
// logs/crash.log. Ctrl+C here (or a normal exit) stops it for good.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MAX_RESTARTS = 5;
export const STABLE_MS = 10 * 60_000;

/**
 * After the server exits: "stop" or "restart".
 *   stopping   you pressed Ctrl+C here (or the wrapper was told to stop)
 *   code 0     it ended normally
 * A stop signal that reached only the server (not this wrapper) was a stray one: restart.
 */
export function decide({ code, signal, restarts, stopping, max = MAX_RESTARTS }) {
  if (stopping) return "stop";
  if (code === 0 && !signal) return "stop";
  if (restarts >= max) return "give-up";
  return "restart";
}

export function runSafe({
  spawnFn = spawn,
  log = (entry) => fs.appendFileSync(path.join(ROOT, "logs", "crash.log"), `${JSON.stringify({ time: new Date().toISOString(), ...entry })}\n`),
  print = (msg) => console.log(msg),
  proc = process,
  delayMs = 2000,
  graceMs = 400, // wait this long after an exit, so a Ctrl+C meant for both of us is seen first
  now = () => Date.now(),
  args = [path.join(ROOT, "server", "index.js")],
} = {}) {
  let restarts = 0;
  let stopping = false;
  let child = null;
  let startedAt = 0;
  try {
    fs.mkdirSync(path.join(ROOT, "logs"), { recursive: true });
  } catch {
    /* logging is best effort */
  }
  const safeLog = (e) => {
    try {
      log(e);
    } catch {
      /* best effort */
    }
  };
  const start = () => {
    startedAt = now();
    child = spawnFn(proc.execPath, args, { cwd: ROOT, stdio: "inherit", env: proc.env });
    child.on("exit", (code, signal) => {
      setTimeout(() => {
        if (now() - startedAt > STABLE_MS) restarts = 0; // it had been running fine
        const d = decide({ code, signal, restarts, stopping });
        if (d === "stop") return done(code ?? 0);
        if (d === "give-up") {
          safeLog({ type: "safe_start_gave_up", code, signal, restarts });
          print(`\n❌ Jericho stopped ${restarts + 1} times in a row; not restarting again. See logs/crash.log.`);
          return done(code || 1);
        }
        restarts++;
        safeLog({ type: "safe_start_restart", code, signal, restart: restarts, of: MAX_RESTARTS });
        print(`\n🔁 Jericho stopped unexpectedly (${signal || `exit code ${code}`}). Restarting (${restarts} of ${MAX_RESTARTS})…`);
        setTimeout(() => !stopping && start(), delayMs);
      }, graceMs);
    });
  };
  let finished;
  const result = new Promise((resolve) => (finished = resolve));
  const done = (code) => finished(code);
  for (const sig of ["SIGINT", "SIGTERM", "SIGBREAK", "SIGHUP"]) {
    proc.on(sig, () => {
      stopping = true;
      safeLog({ type: "safe_start_stop", signal: sig });
      try {
        child?.kill(sig === "SIGBREAK" ? "SIGTERM" : sig);
      } catch {
        /* already gone */
      }
    });
  }
  safeLog({ type: "safe_start", max: MAX_RESTARTS });
  start();
  return { result, stats: () => ({ restarts, stopping }) };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const { result } = runSafe();
  process.exitCode = await result;
}
