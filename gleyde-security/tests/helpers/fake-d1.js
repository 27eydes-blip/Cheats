/* A small stand-in for Cloudflare D1 backed by Node's built-in SQLite, running the real migration. */
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const MIGRATION = new URL("../../migrations/0001_chat.sql", import.meta.url);

class Stmt {
  constructor(db, sql, args = []) {
    this.db = db;
    this.sql = sql;
    this.args = args;
  }
  bind(...args) {
    return new Stmt(this.db, this.sql, args.map((a) => (a === undefined ? null : a)));
  }
  _exec() {
    const st = this.db.raw.prepare(this.sql);
    return /^\s*select/i.test(this.sql) ? { results: st.all(...this.args) } : { results: [], meta: { changes: st.run(...this.args).changes } };
  }
  async run() {
    this.db.check();
    return { success: true, ...this._exec() };
  }
  async all() {
    this.db.check();
    return { success: true, ...this._exec() };
  }
  async first() {
    return (await this.all()).results[0] ?? null;
  }
}

export class FakeD1 {
  constructor() {
    this.raw = new DatabaseSync(":memory:");
    this.raw.exec("PRAGMA foreign_keys = ON;");
    this.raw.exec(readFileSync(MIGRATION, "utf8"));
    this.fail = false;
  }
  check() {
    if (this.fail) throw new Error("D1_ERROR: simulated outage");
  }
  prepare(sql) {
    return new Stmt(this, sql);
  }
  async batch(stmts) {
    this.check();
    this.raw.exec("BEGIN");
    try {
      const out = stmts.map((s) => ({ success: true, ...s._exec() }));
      this.raw.exec("COMMIT");
      return out;
    } catch (err) {
      this.raw.exec("ROLLBACK");
      throw err;
    }
  }
  rows(sql, ...args) {
    return this.raw.prepare(sql).all(...args);
  }
}
