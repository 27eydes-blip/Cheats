// Alarms on disk (data/alarms.json, git-ignored), so they survive restarts.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../config.js";
import { advance, DEFAULT_TZ } from "./time.js";

/** One-time alarms missed by more than this when the server starts are dropped. */
export const MISSED_GRACE_MS = 30 * 60_000;

export class AlarmStore {
  constructor(file = path.join(process.env.JERICHO_DATA_DIR || path.join(ROOT, "data"), "alarms.json"), tz = DEFAULT_TZ) {
    this.file = file;
    this.tz = tz;
    this.alarms = [];
    this.nextId = 1;
  }

  /**
   * Read the file. One-time alarms that are long past are dropped; repeating ones that were
   * missed move on to their next time; one missed only a little (the laptop woke late) stays,
   * so it rings straight away. Returns what changed.
   */
  load(now = new Date()) {
    let data = { alarms: [], nextId: 1 };
    try {
      data = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch {
      /* first run or unreadable: start empty */
    }
    const dropped = [];
    const advanced = [];
    const kept = [];
    for (const a of Array.isArray(data.alarms) ? data.alarms : []) {
      if (!a || !Number.isInteger(a.id) || !Number.isFinite(Date.parse(a.fireAt))) continue;
      a.state = "scheduled"; // nothing is ringing right after a restart
      const late = now.getTime() - Date.parse(a.fireAt);
      if (late > MISSED_GRACE_MS) {
        const next = advance(a, now, this.tz);
        if (!next) {
          dropped.push(a);
          continue;
        }
        a.fireAt = next.toISOString();
        advanced.push(a);
      }
      kept.push(a);
    }
    this.alarms = kept.sort((a, b) => Date.parse(a.fireAt) - Date.parse(b.fireAt));
    this.nextId = Math.max(Number(data.nextId) || 1, ...this.alarms.map((a) => a.id + 1), 1);
    if (dropped.length || advanced.length) this.save();
    return { dropped, advanced };
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ nextId: this.nextId, alarms: this.alarms }, null, 2));
    fs.renameSync(tmp, this.file); // never a half-written file
  }

  add(fields) {
    const alarm = { id: this.nextId++, state: "scheduled", createdAt: new Date().toISOString(), ...fields };
    this.alarms.push(alarm);
    this.sort();
    this.save();
    return alarm;
  }

  get(id) {
    return this.alarms.find((a) => a.id === Number(id)) || null;
  }

  remove(id) {
    const before = this.alarms.length;
    this.alarms = this.alarms.filter((a) => a.id !== Number(id));
    if (this.alarms.length !== before) this.save();
    return before !== this.alarms.length;
  }

  update(alarm) {
    this.sort();
    this.save();
    return alarm;
  }

  sort() {
    this.alarms.sort((a, b) => Date.parse(a.fireAt) - Date.parse(b.fireAt));
  }

  /** In order: the next to ring first. */
  list() {
    return [...this.alarms];
  }
}
