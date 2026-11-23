// Waking the laptop for an alarm (Windows): one Scheduled Task per alarm, named
// "Jericho Alarm <id>", with "Wake the computer to run this task" on, about 2 minutes early.
// The task runs only scripts/alarm-wake.ps1 (a fixed file in this repo): it starts the
// Jericho server if it isn't running and opens the page. No labels, no secrets, no other
// commands are ever put in a task, and only tasks with that exact name pattern are touched.
// Nothing here runs as admin; if Windows wants elevation, the exact command is returned so
// you can run it yourself.
import { spawn } from "node:child_process";
import path from "node:path";
import { ROOT } from "../config.js";
import { cleanEnv } from "../tools/pc.js";

export const TASK_PREFIX = "Jericho Alarm ";
const NAME_RE = /^Jericho Alarm \d{1,9}$/;
export const WAKE_SCRIPT = path.join(ROOT, "scripts", "alarm-wake.ps1");

/** The only task names this code will ever create, change or delete. */
export function isJerichoTaskName(name) {
  return typeof name === "string" && NAME_RE.test(name);
}
export function taskName(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1) throw new Error("bad alarm id");
  const name = `${TASK_PREFIX}${n}`;
  if (!isJerichoTaskName(name)) throw new Error("bad task name");
  return name;
}

/** When the task wakes the PC: `leadMinutes` before the alarm, never in the past. */
export function wakeTime(fireAt, leadMinutes = 2, now = new Date()) {
  const t = new Date(new Date(fireAt).getTime() - leadMinutes * 60_000);
  return t < now ? new Date(now.getTime() + 30_000) : t;
}

const psq = (s) => `'${String(s).replace(/'/g, "''")}'`;

/**
 * The one-line PowerShell command to create the task yourself (only shown when Windows
 * refuses without elevation). Built only from the task name, the fixed script path and the time.
 */
export function manualCommand(id, at) {
  const name = taskName(id);
  const local = new Date(at);
  const stamp = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")} ${String(local.getHours()).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}`;
  const arg = `-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${WAKE_SCRIPT}"`;
  return (
    `Register-ScheduledTask -TaskName ${psq(name)} -Action (New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ${psq(arg)}) ` +
    `-Trigger (New-ScheduledTaskTrigger -Once -At ${psq(stamp)}) ` +
    `-Settings (New-ScheduledTaskSettingsSet -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable) -Force`
  );
}

// Fixed PowerShell scripts. Values come only through environment variables, never pasted in.
const REGISTER = `
$ErrorActionPreference = 'Stop'
$name = $env:JERICHO_ARG0
$file = $env:JERICHO_ARG1
if ($name -notmatch '^Jericho Alarm \\d{1,9}$') { Write-Output 'BAD_NAME'; exit 3 }
$at = [DateTime]::Parse($env:JERICHO_ARG2, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind).ToLocalTime()
try {
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $file + '"')
  $trigger = New-ScheduledTaskTrigger -Once -At $at
  $settings = New-ScheduledTaskSettingsSet -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
  Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Description 'Wakes the PC and opens Jericho for an alarm. Created by Jericho; safe to delete.' -Force | Out-Null
  Write-Output 'OK'
} catch {
  if ($_.Exception.Message -match 'denied|0x80070005|elevat') { Write-Output 'NEEDS_ELEVATION' } else { Write-Output ('ERROR ' + $_.Exception.Message) }
}`;
const REMOVE = `
$name = $env:JERICHO_ARG0
if ($name -notmatch '^Jericho Alarm \\d{1,9}$') { Write-Output 'BAD_NAME'; exit 3 }
Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
Write-Output 'OK'`;
const LIST = `Get-ScheduledTask -TaskName 'Jericho Alarm *' -ErrorAction SilentlyContinue | ForEach-Object { $_.TaskName }`;

function run(command, args, { env = {}, timeoutMs = 20_000 } = {}) {
  return new Promise((resolve) => {
    let out = "";
    let err = "";
    let child;
    try {
      child = spawn(command, args, { env: cleanEnv(env), windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      resolve({ code: -1, out: "", err: e.message });
      return;
    }
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: -1, out, err: e.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out: out.trim(), err: err.trim() });
    });
  });
}
const ps = (script, values = []) =>
  run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], {
    env: Object.fromEntries(values.map((v, i) => [`JERICHO_ARG${i}`, String(v)])),
  });

export const supported = () => process.platform === "win32";

/** Create or update the wake task for an alarm. */
export async function scheduleWake(alarm, { leadMinutes = 2, now = new Date() } = {}) {
  if (!supported()) return { ok: false, status: "not-windows" };
  const name = taskName(alarm.id);
  const at = wakeTime(alarm.fireAt, leadMinutes, now);
  const r = await ps(REGISTER, [name, WAKE_SCRIPT, at.toISOString()]);
  if (r.out.includes("OK")) return { ok: true, status: "scheduled", task: name, at: at.toISOString() };
  if (r.out.includes("NEEDS_ELEVATION")) return { ok: false, status: "needs-elevation", task: name, command: manualCommand(alarm.id, at) };
  return { ok: false, status: "failed", task: name, reason: (r.out || r.err || "PowerShell didn't answer").slice(0, 200) };
}

/** Remove an alarm's wake task (only ever a "Jericho Alarm <number>" task). */
export async function removeWake(id) {
  if (!supported()) return { ok: false, status: "not-windows" };
  const name = taskName(id);
  const r = await ps(REMOVE, [name]);
  return { ok: r.out.includes("OK"), status: r.out.includes("OK") ? "removed" : "failed" };
}

/** Our tasks only: names matching the prefix pattern exactly. */
export async function listWakeTasks() {
  if (!supported()) return [];
  const r = await ps(LIST);
  return r.out.split(/\r?\n/).map((s) => s.trim()).filter(isJerichoTaskName);
}

/**
 * Are wake timers allowed in the current power plan? Reads `powercfg` (no changes).
 * Returns { status: "enabled" | "disabled" | "important-only" | "unknown", ac, dc, howTo }.
 */
export async function wakeTimersStatus() {
  if (!supported()) return { status: "not-windows" };
  const r = await run("powercfg", ["/q", "SCHEME_CURRENT", "SUB_SLEEP", "RTCWAKE"], { timeoutMs: 10_000 });
  return parseWakeTimers(r.out);
}

export const WAKE_TIMER_HELP =
  "To turn them on: Control Panel, Power Options, Change plan settings, Change advanced power settings, Sleep, Allow wake timers, set to Enable (both On battery and Plugged in). " +
  "Or in PowerShell: powercfg /setacvalueindex SCHEME_CURRENT SUB_SLEEP RTCWAKE 1; powercfg /setdcvalueindex SCHEME_CURRENT SUB_SLEEP RTCWAKE 1; powercfg /setactive SCHEME_CURRENT";
export const WAKE_WARNING = "Waking only works from sleep, not when the laptop is shut down, and it's most reliable when plugged in.";

export function parseWakeTimers(text) {
  const ac = /Current AC Power Setting Index:\s*0x([0-9a-f]+)/i.exec(text || "");
  const dc = /Current DC Power Setting Index:\s*0x([0-9a-f]+)/i.exec(text || "");
  if (!ac && !dc) return { status: "unknown", howTo: WAKE_TIMER_HELP };
  const val = (m) => (m ? parseInt(m[1], 16) : null);
  const a = val(ac);
  const d = val(dc);
  const name = (v) => (v === 0 ? "disabled" : v === 2 ? "important-only" : v === 1 ? "enabled" : "unknown");
  const status = a === 1 && (d === null || d === 1) ? "enabled" : a === 0 && d === 0 ? "disabled" : name(a) === "enabled" || name(d) === "enabled" ? "partly" : name(a);
  return { status, ac: name(a), dc: name(d), howTo: WAKE_TIMER_HELP };
}
