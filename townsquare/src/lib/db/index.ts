import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { SCHEMA } from "./schema";

/**
 * The single database handle. Everything that touches storage goes through
 * the modules in src/lib, so swapping SQLite for Supabase means rewriting
 * those modules, not the pages.
 */
type Params = Record<string, SQLInputValue> | SQLInputValue[];

const g = globalThis as unknown as { __tsdb?: DatabaseSync };

function open(): DatabaseSync {
  const file = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "app.db");
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** Additive column migrations for databases created by earlier versions. */
const COLUMNS: [table: string, column: string, definition: string][] = [
  ["users", "interests", "TEXT NOT NULL DEFAULT '[]'"],
  ["users", "onboarded", "INTEGER NOT NULL DEFAULT 1"],
  ["media", "blur", "TEXT"],
  ["live_events", "tag", "TEXT"],
  ["live_events", "description", "TEXT NOT NULL DEFAULT ''"],
  ["live_events", "viewers", "INTEGER NOT NULL DEFAULT 0"],
];

function migrate(db: DatabaseSync) {
  for (const [table, column, def] of COLUMNS) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  }
}

export function db(): DatabaseSync {
  // Reuse one handle across hot reloads in dev.
  if (!g.__tsdb) g.__tsdb = open();
  return g.__tsdb;
}

/** Test helper: drop the handle so the next call opens a fresh database. */
export function resetDbForTests() {
  g.__tsdb?.close();
  g.__tsdb = undefined;
}

function bind(p?: Params): SQLInputValue[] | [Record<string, SQLInputValue>] {
  if (p === undefined) return [];
  return Array.isArray(p) ? p : [p];
}

export function get<T>(sql: string, p?: Params): T | undefined {
  return db().prepare(sql).get(...(bind(p) as SQLInputValue[])) as T | undefined;
}

export function all<T>(sql: string, p?: Params): T[] {
  return db().prepare(sql).all(...(bind(p) as SQLInputValue[])) as T[];
}

export function run(sql: string, p?: Params) {
  return db().prepare(sql).run(...(bind(p) as SQLInputValue[]));
}

let depth = 0;
/** Run fn inside a transaction (nested calls join the outer one). */
export function tx<T>(fn: () => T): T {
  if (depth > 0) return fn();
  const d = db();
  d.exec("BEGIN IMMEDIATE");
  depth++;
  try {
    const out = fn();
    d.exec("COMMIT");
    return out;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  } finally {
    depth--;
  }
}

/** Time-sortable random id: 9 chars of time + 10 chars of randomness. */
export function newId(): string {
  const t = Date.now().toString(36).padStart(9, "0");
  const r = randomBytes(8).toString("base64url").slice(0, 10);
  return t + r;
}

export const now = () => Date.now();
