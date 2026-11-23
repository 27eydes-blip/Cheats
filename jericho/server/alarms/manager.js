// Alarms: set, list, cancel, ring, stop, snooze. The page plays the alarm (Web Audio tone and
// Jericho's voice); if it can't (no page open, or the browser blocks sound), the server plays
// a native Windows alarm sound until it's stopped. A ringing alarm is registered with the
// kill switch, so "Jericho, stop" stops it too. Every step goes to logs/actions.log.
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { settings } from "../config.js";
import { track } from "../cancel.js";
import { logAction } from "../logger.js";
import { cleanEnv } from "../tools/pc.js";
import { AlarmStore } from "./store.js";
import { advance, clockText, DEFAULT_TZ, describeTime, nextOccurrence, parseClock, REPEATS, snoozeUntil } from "./time.js";
import * as wake from "./wake.js";

const cfg = () => settings.alarms || {};
const labelForLog = (label) => (label ? `[${String(label).length} characters]` : "");

// ---- the native backup sound (Windows): a looping system alarm sound, or beeps ----------------
const NATIVE_SCRIPT = `
$f = Join-Path $env:WINDIR 'Media\\Alarm01.wav'
if (Test-Path $f) {
  $p = New-Object System.Media.SoundPlayer $f
  $p.PlayLooping()
  Start-Sleep -Seconds 1800
} else {
  for ($i = 0; $i -lt 600; $i++) { [console]::Beep(880, 220); [console]::Beep(1175, 220); [console]::Beep(1568, 320); Start-Sleep -Milliseconds 700 }
}`;
export const nativeSound = {
  child: null,
  start() {
    if (process.platform !== "win32" || this.child) return false;
    try {
      this.child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", NATIVE_SCRIPT], { env: cleanEnv(), windowsHide: true, stdio: "ignore" });
      this.child.on("exit", () => (this.child = null));
      return true;
    } catch {
      this.child = null;
      return false;
    }
  },
  stop() {
    const c = this.child;
    this.child = null;
    if (!c) return;
    try {
      spawn("taskkill", ["/pid", String(c.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    } catch {
      try {
        c.kill();
      } catch {
        /* already gone */
      }
    }
  },
  get playing() {
    return Boolean(this.child);
  },
};

export class AlarmManager extends EventEmitter {
  constructor({ store, tz = cfg().timezone || DEFAULT_TZ, wakeTasks = wake, native = nativeSound, clock = () => new Date() } = {}) {
    super();
    this.tz = tz;
    this.store = store || new AlarmStore(undefined, tz);
    this.wake = wakeTasks;
    this.native = native;
    this.clock = clock;
    this.ringing = new Map(); // id -> { untrack, ackTimer, maxTimer, acked }
    this.timer = null;
  }

  get snoozeMinutes() {
    return Number(cfg().snoozeMinutes) || 9;
  }

  /** Load from disk, tidy up, start checking every second, and sync the wake tasks. */
  start() {
    const { dropped, advanced } = this.store.load(this.clock());
    if (dropped.length || advanced.length) logAction("alarm_reload", { dropped: dropped.map((a) => a.id), advanced: advanced.map((a) => a.id) });
    this.timer = setInterval(() => this.tick(), 1000);
    this.timer.unref?.();
    this.syncWakeTasks().catch(() => {});
    return this;
  }
  stopTimer() {
    clearInterval(this.timer);
  }

  view(a, i = this.store.list().indexOf(a)) {
    const at = new Date(a.fireAt);
    return {
      id: a.id,
      number: i + 1,
      label: a.label || "",
      repeat: a.repeat || "once",
      fireAt: a.fireAt,
      time: clockText(at, this.tz),
      when: describeTime(at, this.clock(), this.tz),
      state: a.state,
      snoozed: Boolean(a.snoozed),
    };
  }
  list() {
    return this.store.list().map((a, i) => this.view(a, i));
  }

  async set({ time, hour, minute, label = "", repeat = "once" }) {
    if (hour === undefined) {
      const c = parseClock(time);
      if (!c) return { ok: false, error: `I couldn't read "${String(time).slice(0, 40)}" as a time.` };
      ({ hour, minute } = c);
    }
    if (!REPEATS.includes(repeat)) repeat = "once";
    const now = this.clock();
    const fireAt = nextOccurrence({ hour, minute, repeat }, now, this.tz);
    const alarm = this.store.add({ hour, minute, label: String(label || "").trim().slice(0, 80), repeat, fireAt: fireAt.toISOString() });
    logAction("alarm_set", { id: alarm.id, fireAt: alarm.fireAt, repeat, label: labelForLog(alarm.label) });
    const wakeResult = await this.scheduleWake(alarm);
    this.emit("changed");
    return { ok: true, alarm: this.view(alarm), wake: wakeResult };
  }

  /** "2" (the number from the list), an id, a label, or "all". */
  resolve(which) {
    const list = this.store.list();
    const w = String(which ?? "").trim().toLowerCase();
    if (!w) return [];
    if (/^(all|every|everything|all alarms|all of them)$/.test(w)) return list;
    const num = /^(?:number|no\.?|#)?\s*(\d+)$/.exec(w);
    if (num) {
      const n = Number(num[1]);
      return list[n - 1] ? [list[n - 1]] : [];
    }
    const byLabel = list.filter((a) => a.label && (a.label.toLowerCase().includes(w) || w.includes(a.label.toLowerCase())));
    if (byLabel.length) return byLabel;
    // "the 7 am one"
    return list.filter((a) => clockText(new Date(a.fireAt), this.tz).toLowerCase().replace(/\s/g, "") === w.replace(/\s|alarm|the|one/g, ""));
  }

  async cancel(which, why = "cancelled") {
    const targets = this.resolve(which);
    for (const a of targets) {
      this.endRing(a.id);
      this.store.remove(a.id);
      logAction("alarm_cancelled", { id: a.id, why, label: labelForLog(a.label) });
      await this.removeWake(a.id);
    }
    if (targets.length) this.emit("changed");
    return targets.map((a) => this.view(a, -1));
  }

  tick(now = this.clock()) {
    for (const a of this.store.list()) {
      if (a.state !== "scheduled" || Date.parse(a.fireAt) > now.getTime()) continue;
      try {
        this.ring(a);
      } catch (err) {
        // e.g. the disk is full: it still rings, it just couldn't be saved
        logAction("alarm_error", { id: a.id, error: err.message });
      }
    }
  }

  ring(a) {
    a.state = "ringing";
    a.ringingSince = this.clock().toISOString();
    try {
      this.store.update(a);
    } catch {
      /* couldn't save; ring anyway */
    }
    logAction("alarm_ringing", { id: a.id, label: labelForLog(a.label) });
    const ring = { acked: false };
    // the kill switch ("Jericho, stop", Stop) stops a ringing alarm too
    ring.untrack = track("alarm", `alarm ${a.id}`, () => this.stop(a.id, "kill switch").catch(() => {}));
    // no page has said it's ringing within 10 s: play the native sound
    ring.ackTimer = setTimeout(() => {
      if (this.ringing.has(a.id) && !ring.acked) this.startNative("no page played it");
    }, 10_000);
    ring.maxTimer = setTimeout(() => this.stop(a.id, "rang for too long").catch(() => {}), (Number(cfg().maxRingMinutes) || 30) * 60_000);
    ring.ackTimer.unref?.();
    ring.maxTimer.unref?.();
    this.ringing.set(a.id, ring);
    this.emit("ring", this.view(a));
  }

  /** The page is ringing it out loud. */
  ack(id) {
    for (const [rid, r] of this.ringing) if (id == null || rid === Number(id)) r.acked = true;
    return { ok: true };
  }
  /** The page couldn't play sound (browser blocked it): play the native sound until stopped. */
  blocked() {
    if (this.ringing.size) this.startNative("browser blocked sound");
    return { ok: true, native: this.native.playing };
  }
  startNative(why) {
    if (this.native.playing) return;
    const ok = this.native.start();
    logAction("alarm_native_sound", { started: ok, why });
  }

  endRing(id) {
    const r = this.ringing.get(id);
    if (!r) return false;
    clearTimeout(r.ackTimer);
    clearTimeout(r.maxTimer);
    r.untrack?.();
    this.ringing.delete(id);
    if (this.ringing.size === 0) this.native.stop();
    return true;
  }

  ringingIds() {
    return [...this.ringing.keys()];
  }

  /** Stop the ringing alarm (or all ringing ones): a one-time alarm is done, a repeating one moves on. */
  async stop(id = null, why = "stopped") {
    const ids = id == null ? this.ringingIds() : [Number(id)].filter((x) => this.ringing.has(x));
    const done = [];
    for (const rid of ids) {
      this.endRing(rid);
      const a = this.store.get(rid);
      if (!a) continue;
      const next = advance(a, this.clock(), this.tz);
      if (next) {
        Object.assign(a, { fireAt: next.toISOString(), state: "scheduled", snoozed: false });
        delete a.ringingSince;
        this.store.update(a);
        await this.scheduleWake(a);
      } else {
        this.store.remove(rid);
        await this.removeWake(rid);
      }
      logAction("alarm_stopped", { id: rid, why, next: next ? next.toISOString() : null });
      done.push(rid);
    }
    if (done.length) this.emit("stopped", { ids: done, why });
    return { ok: true, stopped: done };
  }

  async snooze(id = null, minutes = this.snoozeMinutes) {
    const ids = id == null ? this.ringingIds() : [Number(id)].filter((x) => this.ringing.has(x));
    const until = snoozeUntil(this.clock(), minutes);
    for (const rid of ids) {
      this.endRing(rid);
      const a = this.store.get(rid);
      if (!a) continue;
      // a repeating alarm keeps its usual time: only this ring moves
      Object.assign(a, { fireAt: until.toISOString(), state: "scheduled", snoozed: true });
      this.store.update(a);
      await this.scheduleWake(a);
      logAction("alarm_snoozed", { id: rid, until: until.toISOString() });
    }
    if (ids.length) this.emit("stopped", { ids, why: "snoozed", until: until.toISOString() });
    return { ok: true, snoozed: ids, until: until.toISOString(), time: clockText(until, this.tz) };
  }

  // ---- Windows wake tasks -------------------------------------------------------------------
  async scheduleWake(alarm) {
    if (cfg().wakeTasks === false) return { ok: false, status: "off" };
    try {
      const r = await this.wake.scheduleWake(alarm, { leadMinutes: Number(cfg().wakeLeadMinutes) || 2, now: this.clock() });
      if (r.status !== "not-windows") logAction("alarm_wake_task", { id: alarm.id, status: r.status, at: r.at });
      return r;
    } catch (err) {
      return { ok: false, status: "failed", reason: err.message };
    }
  }
  async removeWake(id) {
    try {
      const r = await this.wake.removeWake(id);
      if (r.status !== "not-windows") logAction("alarm_wake_task", { id, status: r.status });
      return r;
    } catch {
      return { ok: false };
    }
  }
  /** On start: remove leftover "Jericho Alarm" tasks for alarms that no longer exist, refresh the rest. */
  async syncWakeTasks() {
    if (cfg().wakeTasks === false || !this.wake.supported()) return;
    const ids = new Set(this.store.list().map((a) => a.id));
    for (const name of await this.wake.listWakeTasks()) {
      const id = Number(name.slice(wake.TASK_PREFIX.length));
      if (!ids.has(id)) await this.removeWake(id);
    }
    for (const a of this.store.list()) await this.scheduleWake(a);
  }
}

/** The one the server uses (started in server/index.js). */
export const alarms = new AlarmManager();
