import { test } from "node:test";
import assert from "node:assert/strict";
import { CACHE_MS, getConditions, RETRY_MS } from "../src/lib/weather.ts";

/** Minimal in-memory stand-in for the D1 weather_cache table. */
function fakeDb() {
  const rows = new Map<number, { json: string; fetched_at: number }>();
  return {
    rows,
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              return rows.get(args[0] as number) ?? null;
            },
            async run() {
              if (sql.startsWith("INSERT OR REPLACE")) rows.set(args[0] as number, { json: args[1] as string, fetched_at: args[2] as number });
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}
const city = { id: 1, slug: "t", lat: 1, lon: 2, coastal: 1, timezone: "America/New_York" } as never;

test("weather outage: no throw, backs off instead of refetching every view", async () => {
  const db = fakeDb();
  let calls = 0;
  const real = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls++;
    throw new Error("network down");
  }) as typeof fetch;
  try {
    assert.equal(await getConditions(db as never, city), null);
    const afterFirst = calls;
    assert.ok(afterFirst >= 1);
    assert.equal(await getConditions(db as never, city), null);
    assert.equal(calls, afterFirst, "second page view should not hit the failing service");
    // once the retry window has passed, it tries again
    const row = db.rows.get(1)!;
    row.fetched_at -= RETRY_MS + 1000;
    await getConditions(db as never, city);
    assert.ok(calls > afterFirst);
  } finally {
    globalThis.fetch = real;
  }
});

test("weather outage keeps serving the last good reading", async () => {
  const db = fakeDb();
  const good = { tempF: 80, updatedAt: Date.now() - CACHE_MS - 60_000 };
  db.rows.set(1, { json: JSON.stringify(good), fetched_at: good.updatedAt });
  const real = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("down");
  }) as typeof fetch;
  try {
    const c = await getConditions(db as never, city);
    assert.equal(c?.tempF, 80);
    assert.equal((await getConditions(db as never, city))?.tempF, 80);
  } finally {
    globalThis.fetch = real;
  }
});
