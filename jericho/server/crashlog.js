// Why did Jericho stop? Every exit, uncaught error, unhandled rejection and stop signal (Ctrl+C,
// Ctrl+Break, terminate, hang-up) goes to logs/crash.log as one JSON line, with the reason and exit
// code, and the console says clearly that the server is about to stop. Secrets are scrubbed.
import fs from "node:fs";
import path from "node:path";

const SIGNAL_CODES = { SIGHUP: 129, SIGINT: 130, SIGBREAK: 149, SIGTERM: 143 };
const SIGNAL_NAMES = { SIGINT: "Ctrl+C", SIGBREAK: "Ctrl+Break", SIGTERM: "asked to terminate", SIGHUP: "the console window closed" };

/**
 * Installs the handlers. Everything is injectable so it can be tested without stopping the test run.
 * scrub(text) removes secrets; exit(code) ends the process.
 */
export function installCrashLog({
  file,
  proc = process,
  scrub = (t) => t,
  log = console,
  exit = (code) => proc.exit(code),
  now = () => new Date(),
  signals = Object.keys(SIGNAL_CODES),
} = {}) {
  let reason = null; // why we're exiting, for the final "exit" line
  const write = (type, details = {}) => {
    const entry = { time: now().toISOString(), type, pid: proc.pid, uptimeSeconds: Math.round(proc.uptime?.() ?? 0), ...details };
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, `${scrub(JSON.stringify(entry))}\n`); // synchronous: works inside "exit"
    } catch {
      /* the log itself failed: never make things worse */
    }
  };
  const describe = (err) => ({ error: String(err?.message ?? err).slice(0, 500), stack: String(err?.stack || "").split("\n").slice(0, 6).join("\n") });

  proc.on("uncaughtException", (err, origin) => {
    reason = "uncaught error";
    write("uncaught_exception", { origin, ...describe(err) });
    log.error(`\n❌ Jericho hit an error it couldn't recover from and is stopping: ${scrub(String(err?.message ?? err))}\n   Details are in ${file}.`);
    exit(1);
  });
  proc.on("unhandledRejection", (err) => {
    // a stray background error: logged, and Jericho keeps running
    write("unhandled_rejection", describe(err));
    log.warn(`Unhandled error (Jericho keeps running): ${scrub(String(err?.message ?? err))}`);
  });
  for (const sig of signals) {
    proc.on(sig, () => {
      reason = `${sig} (${SIGNAL_NAMES[sig] || "signal"})`;
      write("signal", { signal: sig, meaning: SIGNAL_NAMES[sig] || "" });
      log.warn(`\n⚠️  Jericho is stopping: it received ${sig} (${SIGNAL_NAMES[sig] || "a stop signal"}).`);
      exit(SIGNAL_CODES[sig] ?? 1);
    });
  }
  proc.on("beforeExit", (code) => {
    // Nothing left to do: this should never happen while the server is listening.
    write("before_exit", { code, note: "nothing left running (event loop empty)" });
  });
  proc.on("exit", (code) => {
    const why = reason || (code === 0 ? "normal exit" : `exit code ${code}`);
    write("exit", { code, reason: why });
    if (!reason) log.warn(`\n⚠️  Jericho is stopping (${why}). See ${file}.`);
  });
  write("start", { node: proc.version, platform: proc.platform });
  return { write };
}
