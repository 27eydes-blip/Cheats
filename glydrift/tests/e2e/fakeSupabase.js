// A tiny stand-in for the Supabase server, shared by every browser context of a test: two
// "devices" (two contexts) read and write the same rows, through the game's real supabase-js
// requests (anonymous sign-in, PostgREST selects / counts / upserts / updates). Nothing reaches
// the real server. Only the parts of PostgREST the game's leaderboard uses are understood:
// eq / neq / gt / gte / is filters, or=(…), order, limit, HEAD counts and merge-duplicates
// upserts. Other tables answer empty.
//
// It stores what the game sends as is (no server triggers): the SQL itself is tested on a real
// Postgres in illegal-board.spec.js.

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (sub) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, role: "authenticated", aud: "authenticated", exp: 4102444800, is_anonymous: true })}.sig`;

export function fakeSupabase({ rows = [] } = {}) {
  const db = { scores: rows.map((r, i) => ({ id: i + 1, created_at: "2026-11-01T00:00:00Z", ...r })), coin_grants: [] };
  let nextId = db.scores.length + 1;
  let users = 0;
  const tokens = new Map(); // access token → user id
  const log = [];

  const userFor = (req) => tokens.get((req.headers().authorization || "").replace(/^Bearer /, ""));

  function parseValue(v) {
    if (v === "null") return null;
    if (v === "true") return true;
    if (v === "false") return false;
    return v;
  }
  /** One PostgREST condition ("eq.x") on a row's column. */
  function test(row, col, cond) {
    const i = cond.indexOf(".");
    const op = cond.slice(0, i);
    const raw = cond.slice(i + 1);
    const v = row[col];
    const num = (x) => (typeof v === "number" ? Number(x) : x);
    switch (op) {
      case "eq":
        return String(v) === raw;
      case "neq":
        return v !== null && v !== undefined && String(v) !== raw; // SQL: null <> x is not true
      case "gt":
        return v !== null && v > num(raw);
      case "gte":
        return v !== null && v >= num(raw);
      case "lt":
        return v !== null && v < num(raw);
      case "is":
        return (v ?? null) === parseValue(raw);
      default:
        throw new Error(`fakeSupabase: unknown filter ${op}`);
    }
  }
  /** or=(a.op.x,b.op.y) */
  function testOr(row, expr) {
    const inner = expr.replace(/^\(|\)$/g, "");
    return inner.split(",").some((part) => {
      const i = part.indexOf(".");
      return test(row, part.slice(0, i), part.slice(i + 1));
    });
  }
  const RESERVED = new Set(["select", "order", "limit", "offset", "or", "on_conflict", "columns"]);
  function filtered(table, url) {
    let out = db[table] || [];
    for (const [k, v] of url.searchParams) {
      if (k === "or") out = out.filter((r) => testOr(r, v));
      else if (!RESERVED.has(k)) out = out.filter((r) => test(r, k, v));
    }
    return out;
  }
  function project(rows, url) {
    const sel = url.searchParams.get("select");
    if (!sel || sel === "*") return rows;
    const cols = sel.split(",");
    return rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null])));
  }
  function ordered(rows, url) {
    const order = url.searchParams.get("order");
    let out = [...rows];
    if (order) {
      const keys = order.split(",").map((o) => {
        const [col, dir] = o.split(".");
        return { col, desc: dir === "desc" };
      });
      out.sort((a, b) => {
        for (const { col, desc } of keys) {
          if (a[col] === b[col]) continue;
          return (a[col] < b[col] ? -1 : 1) * (desc ? -1 : 1);
        }
        return 0;
      });
    }
    const limit = Number(url.searchParams.get("limit") || 0);
    return limit ? out.slice(0, limit) : out;
  }

  const json = (route, status, body, headers = {}) =>
    route.fulfill({
      status,
      headers: { "content-type": "application/json", "access-control-allow-origin": "*", ...headers },
      body: body === undefined ? "" : JSON.stringify(body),
    });

  async function handle(route) {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    if (method === "OPTIONS")
      return route.fulfill({
        status: 200,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET,POST,PATCH,DELETE,HEAD,OPTIONS",
          "access-control-expose-headers": "content-range",
        },
      });
    // ---- auth
    if (url.pathname.startsWith("/auth/v1/")) {
      if (url.pathname.endsWith("/signup") || url.pathname.endsWith("/token")) {
        const id = `00000000-0000-4000-8000-${String(++users).padStart(12, "0")}`;
        const token = jwt(id);
        tokens.set(token, id);
        const user = { id, aud: "authenticated", role: "authenticated", is_anonymous: true, email: "", app_metadata: {}, user_metadata: {} };
        return json(route, 200, {
          access_token: token,
          token_type: "bearer",
          expires_in: 3600 * 24 * 365,
          expires_at: 4102444800,
          refresh_token: `r${id}`,
          user,
        });
      }
      if (url.pathname.endsWith("/user")) {
        const id = userFor(req);
        return id
          ? json(route, 200, { id, aud: "authenticated", role: "authenticated", is_anonymous: true, app_metadata: {}, user_metadata: {} })
          : json(route, 401, { message: "no session" });
      }
      return json(route, 200, {});
    }
    // ---- database
    const m = url.pathname.match(/^\/rest\/v1\/(rpc\/)?([a-z_]+)/);
    if (!m) return json(route, 404, {});
    if (m[1]) {
      // the coin grants claim (supabase/migrations/20261115000002): the caller's unclaimed
      // grants, marked claimed in the same step
      if (m[2] === "glydrift_claim_grants") {
        const me = userFor(req);
        const mine = (db.coin_grants || []).filter((g) => g.player_id === me && !g.claimed_at);
        for (const g of mine) g.claimed_at = new Date().toISOString();
        log.push(`RPC claim ${mine.length}`);
        return json(route, 200, mine.map(({ id, coins, note }) => ({ id, coins, note })));
      }
      return json(route, 200, null); // other functions: nothing to say
    }
    const table = m[2];
    const me = userFor(req);
    log.push(`${method} ${table} ${url.search}`);
    if (method === "GET" || method === "HEAD") {
      const rows = filtered(table, url);
      const headers = { "content-range": `0-${Math.max(0, rows.length - 1)}/${rows.length}` };
      if (method === "HEAD") return json(route, 200, undefined, headers);
      return json(route, 200, project(ordered(rows, url), url), headers);
    }
    if (method === "POST") {
      if (table !== "scores") return json(route, 201, []);
      const body = JSON.parse(req.postData() || "[]");
      for (const row of Array.isArray(body) ? body : [body]) {
        if (row.player_id !== me) return json(route, 403, { code: "42501", message: "row-level security" });
        const old = db.scores.find((r) => r.player_id === row.player_id && r.level === row.level);
        if (old) Object.assign(old, row);
        else db.scores.push({ id: nextId++, ...row });
      }
      return json(route, 201, []);
    }
    if (method === "PATCH") {
      const body = JSON.parse(req.postData() || "{}");
      for (const r of filtered(table, url)) if (table !== "scores" || r.player_id === me) Object.assign(r, body);
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
    }
    return json(route, 405, {});
  }

  return { db, handle, log };
}
