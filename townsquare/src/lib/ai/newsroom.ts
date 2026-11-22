import { AppError } from "../errors";
import { all, get, newId, now, run, tx } from "../db";
import { getSetting, setSetting } from "../newsroom/settings";
import { personaBySlug, PERSONAS } from "./personas";
import { costUsd, estimatePostUsd, FORMATS, hasApiKey, aiModel, type AiWriter, type Format, type SourceDoc, type Usage, type Verdict } from "./writer";

/**
 * The AI newsroom: ten openly-AI accounts that each hour read the newest real
 * stories in their niche from the ingest and write 1 to 2 short dispatches.
 *
 * Safety, in the order the scheduler applies it:
 *   1. Global kill switch (stored OFF until an admin turns it on), API key present, spending caps set and not reached.
 *   2. One run per account per hour, claimed in the database first, so a restart never repeats an hour.
 *   3. Only real, non-demo ingested articles; skip the hour when a niche has no new material.
 *   4. Violence, emergencies and unconfirmed claims are held until two different outlets report the story.
 *   5. A deterministic grounding check (numbers and quotes must appear in the sources) plus a second model pass
 *      that checks every claim against the source text. Anything unsupported is blocked and logged.
 *   6. One dispatch per story across all AI accounts (a unique index), and formats rotate per account.
 */

export type AiSettings = { enabled: boolean; approval: "auto" | "manual" };
const SETTINGS_KEY = "ai_newsroom";

export function aiSettings(): AiSettings {
  try {
    const v = JSON.parse(getSetting(SETTINGS_KEY) ?? "{}");
    return { enabled: v.enabled === true, approval: v.approval === "manual" ? "manual" : "auto" };
  } catch {
    return { enabled: false, approval: "auto" };
  }
}
export function setAiSettings(patch: Partial<AiSettings>) {
  const next = { ...aiSettings(), ...patch };
  setSetting(SETTINGS_KEY, JSON.stringify({ enabled: !!next.enabled, approval: next.approval === "manual" ? "manual" : "auto" }));
  return next;
}

// ------------------------------------------------------------------ spending

const num = (v: string | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
/** Daily and monthly caps in USD from Railway variables. Unset means 0, which means nothing is spent. */
export const caps = () => ({ daily: num(process.env.AI_DAILY_CAP_USD), monthly: num(process.env.AI_MONTHLY_CAP_USD) });

const dayStart = (t: number) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};
const monthStart = (t: number) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
};

export function spend(t = now()) {
  const sum = (since: number) => get<{ s: number | null }>("SELECT sum(cost_usd) s FROM ai_usage WHERE at >= ?", [since])?.s ?? 0;
  return { today: sum(dayStart(t)), month: sum(monthStart(t)), total: sum(0) };
}

/** Why spending is not allowed right now, or null when it is. */
export function spendBlock(t = now(), next = estimatePostUsd()): string | null {
  const c = caps();
  if (!c.daily || !c.monthly) return "Spending caps are not set (AI_DAILY_CAP_USD and AI_MONTHLY_CAP_USD).";
  const s = spend(t);
  if (s.today + next > c.daily) return `Daily cap reached ($${s.today.toFixed(2)} of $${c.daily.toFixed(2)}).`;
  if (s.month + next > c.monthly) return `Monthly cap reached ($${s.month.toFixed(2)} of $${c.monthly.toFixed(2)}).`;
  return null;
}

function recordUsage(accountId: string, purpose: "draft" | "verify", u: Usage) {
  const cost = costUsd(u, aiModel());
  run("INSERT INTO ai_usage (id, at, account_id, purpose, model, input_tokens, output_tokens, cost_usd) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [
    newId(),
    now(),
    accountId,
    purpose,
    u.model,
    u.inputTokens + u.cacheRead + u.cacheWrite,
    u.outputTokens,
    cost,
  ]);
  return cost;
}

// ------------------------------------------------------------------ hours

/** "2026-11-22T14": one slot per UTC hour. */
export const slotOf = (t: number) => new Date(t).toISOString().slice(0, 13);

export function hourIn(t: number, tz = process.env.AI_TIMEZONE || "UTC") {
  try {
    return Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(new Date(t))) % 24;
  } catch {
    return new Date(t).getUTCHours();
  }
}

/** Posting hours: "all", "6-22", "6-11,13-20" or "8,12,18" (hours in AI_TIMEZONE, default UTC). */
export function parseHours(spec: string): Set<number> | null {
  const s = spec.trim().toLowerCase();
  if (!s || s === "all" || s === "*") return null;
  const out = new Set<number>();
  for (const part of s.split(",")) {
    const m = part.trim().match(/^(\d{1,2})(?:\s*-\s*(\d{1,2}))?$/);
    if (!m) throw new AppError(`Posting hours must look like "all", "6-22" or "8,12,18" (got "${part.trim()}").`);
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    if (a > 23 || b > 23) throw new AppError("Hours go from 0 to 23.");
    for (let h = a; ; h = (h + 1) % 24) {
      out.add(h);
      if (h === b) break;
    }
  }
  return out;
}
export function inPostingHours(spec: string, hour: number) {
  try {
    const set = parseHours(spec);
    return !set || set.has(hour);
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ material

export type AccountRow = {
  user_id: string;
  slug: string;
  niche: string;
  style_guide: string;
  paused: number;
  post_hours: string;
  max_per_hour: number;
  format_cursor: number;
  last_run_at: number | null;
  handle: string;
  display_name: string;
};

export const listAccounts = () =>
  all<AccountRow>("SELECT a.*, u.handle, u.display_name FROM ai_accounts a JOIN users u ON u.id = a.user_id WHERE u.status = 'active' ORDER BY a.created_at, a.slug");

type StoryRow = { key: string; title: string; category: string | null; importance: number };

/** Violence, active emergencies and unconfirmed claims wait for two outlets. */
const SENSITIVE =
  /\b(shoot(ing|ings|er)?|shot dead|gunman|gunfire|killed|killing|dead|deaths?|death toll|casualt(y|ies)|explosions?|blast|bomb(ing|s)?|attack(ed|s|er)?|stabb(ing|ed)|hostages?|massacre|terror(ism|ist|ists)?|evacuat(e|ed|ion|ions)|wildfires?|earthquake|hurricane|tornado(es)?|tsunami|flood(ing|s)?|emergency|unconfirmed|unverified|reportedly|rumou?rs?|alleged(ly)?|claims? (that|to|responsibility))\b/i;

export const needsConfirmation = (text: string) => SENSITIVE.test(text);

const words = (s: string) => ` ${s.toLowerCase().replace(/[^\w&.\s-]/g, " ").replace(/\s+/g, " ")} `;

export function matchesNiche(slug: string, story: Pick<StoryRow, "category" | "title">, docs: Pick<SourceDoc, "title" | "snippet">[]) {
  const p = personaBySlug(slug);
  if (!p) return false;
  if (p.categories.length) return !!story.category && (p.categories as string[]).includes(story.category);
  const titles = words([story.title, ...docs.map((d) => d.title)].join(" "));
  const body = words(docs.map((d) => d.snippet).join(" "));
  let hitsTitle = 0;
  let hitsBody = 0;
  for (const k of p.keywords) {
    if (titles.includes(` ${k} `)) hitsTitle++;
    if (body.includes(` ${k} `)) hitsBody++;
  }
  return hitsTitle >= 1 || hitsBody >= 2;
}

/** The newest real articles of a story, one per outlet (demo outlets never count). */
export function storySources(key: string): SourceDoc[] {
  const rows = all<{ id: string; title: string; summary: string; url: string; published_at: number; opinion: number; outlet: string; lean: string | null; source_id: string }>(
    `SELECT i.id, i.title, i.summary, i.url, i.published_at, i.opinion, n.name outlet, n.lean, n.id source_id
     FROM news_items i JOIN news_sources n ON n.id = i.source_id
     WHERE i.story_key = ? AND COALESCE(n.demo, 0) = 0 ORDER BY i.published_at DESC LIMIT 30`,
    [key],
  );
  const seen = new Set<string>();
  const out: SourceDoc[] = [];
  for (const r of rows) {
    if (seen.has(r.source_id)) continue;
    seen.add(r.source_id);
    out.push({ id: `S${out.length + 1}`, outlet: r.outlet, lean: r.lean, opinion: !!r.opinion, title: r.title, snippet: r.summary, url: r.url, publishedAt: r.published_at });
    if (out.length >= 6) break;
  }
  return out;
}

const hasMaterial = (docs: SourceDoc[]) => docs.some((d) => `${d.title} ${d.snippet}`.trim().length >= 60);

/** Stories this account may write about now: real, recent, in its niche, never posted by any AI account, never tried by this one. */
export function pickStories(account: Pick<AccountRow, "user_id" | "slug">, t = now(), limit = 2) {
  const fresh = all<StoryRow>(
    `SELECT s.key, s.title, s.category, s.importance FROM stories s
     WHERE s.origin = 'real' AND COALESCE(s.last_article_at, s.updated_at) > ?
       AND NOT EXISTS (SELECT 1 FROM ai_posts a WHERE a.story_key = s.key AND a.status IN ('posted','queued','deleted','rejected'))
       AND NOT EXISTS (SELECT 1 FROM ai_posts a WHERE a.story_key = s.key AND a.account_id = ? AND a.status IN ('blocked','error','skipped'))
     ORDER BY s.importance DESC, COALESCE(s.last_article_at, s.updated_at) DESC LIMIT 150`,
    [t - 12 * 3_600_000, account.user_id],
  );
  const picks: { story: StoryRow; sources: SourceDoc[]; held: boolean }[] = [];
  for (const s of fresh) {
    const sources = storySources(s.key);
    if (!hasMaterial(sources) || !matchesNiche(account.slug, s, sources)) continue;
    const text = [s.title, ...sources.map((d) => `${d.title} ${d.snippet}`)].join(" ");
    const held = needsConfirmation(text) && new Set(sources.map((d) => d.outlet)).size < 2;
    picks.push({ story: s, sources, held });
    if (picks.filter((p) => !p.held).length >= limit) break;
  }
  return picks;
}

/** Contested: politics, opinion pieces in the mix, or coverage from both sides of the spectrum. */
export function isContested(story: Pick<StoryRow, "category">, sources: SourceDoc[]) {
  const leans = new Set(sources.map((s) => s.lean ?? ""));
  const left = leans.has("Left") || leans.has("Lean Left");
  const right = leans.has("Right") || leans.has("Lean Right");
  return story.category === "Politics" || sources.some((s) => s.opinion) || (left && right);
}

// ------------------------------------------------------------------ grounding check

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/(\d),(\d{3})/g, "$1$2")
    .replace(/\s+/g, " ");

const ENDORSE = /\b(vote (for|against)|you should (support|oppose|vote)|endorse[sd]?|best candidate|deserves? to win|should win the (election|race|primary)|(support|back) (the )?(democrats|republicans|gop))\b/i;

/**
 * Deterministic checks that need no model: every number and every quoted
 * phrase must appear in the source text; no links, @mentions or endorsements;
 * within length. Returns the problems found (empty means it passed).
 */
export function groundingCheck(body: string, sources: Pick<SourceDoc, "title" | "snippet">[]): string[] {
  const problems: string[] = [];
  const text = norm(sources.map((s) => `${s.title} \n ${s.snippet}`).join(" \n "));
  const b = norm(body);
  if (!body.trim()) problems.push("The draft is empty.");
  if ([...body].length > 480) problems.push("The draft is longer than 480 characters.");
  if (/https?:\/\/|www\./i.test(body)) problems.push("The draft contains a link (links come from the source list).");
  if (/(^|\s)@\w/.test(body)) problems.push("The draft mentions an account.");
  if (ENDORSE.test(body)) problems.push("The draft reads as an endorsement.");
  if (/\b(as an ai|i am an ai|i'm an ai|as a (reporter|journalist|former|veteran)|in my (years|experience))\b/i.test(body)) problems.push("The draft makes a claim about the writer.");
  for (const m of b.matchAll(/\d+(?:\.\d+)?/g)) {
    const n = m[0];
    const re = new RegExp(`(^|[^\\d.])${n.replace(".", "\\.")}($|[^\\d]|\\.(?!\\d))`);
    if (!re.test(text)) problems.push(`The number "${n}" is not in the sources.`);
  }
  for (const m of b.matchAll(/"([^"]{3,})"/g)) {
    const q = m[1].trim().replace(/[.,;:!?]+$/, "");
    if (q.split(" ").length >= 2 && !text.includes(q)) problems.push(`The quote "${q}" is not in the sources.`);
  }
  return [...new Set(problems)];
}

// ------------------------------------------------------------------ the hourly run

export type RunSummary = { skipped?: string; slot: string; accounts: { handle: string; outcome: string; note: string }[]; posted: number; queued: number; blocked: number; spentUsd: number };

const g = globalThis as unknown as { __aiRunning?: boolean };

/**
 * One pass of the hourly scheduler. Safe to call any number of times: each
 * account runs at most once per hour slot (claimed in ai_runs before any spend),
 * and a story is posted at most once (unique index on ai_posts).
 */
export async function runAiHour(opts: { writer: AiWriter | null; t?: number; only?: string }): Promise<RunSummary> {
  const t = opts.t ?? now();
  const slot = slotOf(t);
  const summary: RunSummary = { slot, accounts: [], posted: 0, queued: 0, blocked: 0, spentUsd: 0 };
  const settings = aiSettings();
  if (!settings.enabled) return { ...summary, skipped: "The AI newsroom is switched off (kill switch)." };
  if (!opts.writer || (!hasApiKey() && !process.env.VITEST)) return { ...summary, skipped: "ANTHROPIC_API_KEY is not set." };
  const capped = spendBlock(t);
  if (capped) return { ...summary, skipped: capped };
  if (g.__aiRunning) return { ...summary, skipped: "A run is already in progress." };
  g.__aiRunning = true;
  try {
    const hour = hourIn(t);
    for (const acct of listAccounts()) {
      if (opts.only && acct.user_id !== opts.only) continue;
      if (acct.paused || !inPostingHours(acct.post_hours, hour)) continue;
      // Claim the hour first: after a restart the same hour is never run twice.
      if (run("INSERT OR IGNORE INTO ai_runs (account_id, slot, started_at) VALUES (?, ?, ?)", [acct.user_id, slot, now()]).changes !== 1) continue;
      const result = await runAccount(acct, slot, settings, opts.writer, summary);
      run("UPDATE ai_runs SET finished_at = ?, outcome = ?, note = ? WHERE account_id = ? AND slot = ?", [now(), result.outcome, result.note.slice(0, 500), acct.user_id, slot]);
      run("UPDATE ai_accounts SET last_run_at = ? WHERE user_id = ?", [now(), acct.user_id]);
      summary.accounts.push({ handle: acct.handle, ...result });
      if (result.outcome === "cap_reached" || result.outcome === "stopped") break;
    }
  } finally {
    g.__aiRunning = false;
  }
  return summary;
}

function logPost(row: { account: string; slot: string; story: string | null; format: Format; body?: string; sources?: SourceDoc[]; status: string; reason?: string; verification?: unknown; cost?: number }) {
  const id = newId();
  run(
    `INSERT INTO ai_posts (id, account_id, slot, story_key, format, body, sources, status, reason, verification, model, cost_usd, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, row.account, row.slot, row.story, row.format, row.body ?? "", JSON.stringify(row.sources ?? []), row.status, (row.reason ?? "").slice(0, 1000), JSON.stringify(row.verification ?? {}), aiModel(), row.cost ?? 0, now()],
  );
  return id;
}

async function runAccount(acct: AccountRow, slot: string, settings: AiSettings, writer: AiWriter, summary: RunSummary): Promise<{ outcome: string; note: string }> {
  const persona = personaBySlug(acct.slug);
  if (!persona) return { outcome: "skipped", note: "Unknown desk." };
  const picks = pickStories(acct, now(), Math.max(1, Math.min(2, acct.max_per_hour)));
  const ready = picks.filter((p) => !p.held);
  for (const p of picks.filter((x) => x.held)) {
    if (!get("SELECT 1 FROM ai_posts WHERE account_id = ? AND story_key = ? AND status = 'held'", [acct.user_id, p.story.key]))
      logPost({ account: acct.user_id, slot, story: p.story.key, format: "quick_take", sources: p.sources, status: "held", reason: "Breaking violence, an emergency or an unconfirmed claim: waiting until at least two outlets report it." });
  }
  if (!ready.length) return { outcome: "no_material", note: picks.length ? "Only stories waiting for a second outlet." : "No new real stories in this niche this hour." };

  const notes: string[] = [];
  for (const p of ready) {
    const block = spendBlock();
    if (block) return { outcome: "cap_reached", note: block };
    const format = FORMATS[acct.format_cursor % FORMATS.length];
    acct.format_cursor++;
    run("UPDATE ai_accounts SET format_cursor = ? WHERE user_id = ?", [acct.format_cursor, acct.user_id]);
    const input = { persona: { name: acct.display_name, niche: acct.niche, style: acct.style_guide || persona.style }, format, storyTitle: p.story.title, contested: isContested(p.story, p.sources), sources: p.sources };
    let cost = 0;
    try {
      const d = await writer.draft(input);
      cost += recordUsage(acct.user_id, "draft", d.usage);
      if (d.draft.skip || !d.draft.body) {
        logPost({ account: acct.user_id, slot, story: p.story.key, format, sources: p.sources, status: "skipped", reason: d.draft.skipReason || "The writer skipped this story.", cost });
        notes.push(`skipped ${p.story.key}`);
        continue;
      }
      const used = p.sources.filter((s) => d.draft.sourceIds.includes(s.id));
      const cited = used.length ? used : p.sources;
      const problems = groundingCheck(d.draft.body, p.sources);
      const v = await writer.verify({ ...input, body: d.draft.body });
      cost += recordUsage(acct.user_id, "verify", v.usage);
      const verdict: Verdict & { checks: string[] } = { ...v.verdict, checks: problems };
      summary.spentUsd += cost;
      if (problems.length || !v.verdict.pass) {
        const reason = [...problems, ...v.verdict.unsupported.map((c) => `Unsupported: ${c}`), v.verdict.endorses ? "Reads as an endorsement." : "", v.verdict.oneSided ? "One-sided on a contested story." : ""].filter(Boolean).join(" ");
        logPost({ account: acct.user_id, slot, story: p.story.key, format, body: d.draft.body, sources: cited, status: "blocked", reason, verification: verdict, cost });
        console.warn(`[ai] blocked a dispatch by @${acct.handle} on ${p.story.key}: ${reason.slice(0, 300)}`);
        summary.blocked++;
        notes.push(`blocked ${p.story.key}`);
        continue;
      }
      const status = settings.approval === "manual" ? "queued" : "posted";
      const res = tx(() => {
        try {
          const id = logPost({ account: acct.user_id, slot, story: p.story.key, format, body: d.draft.body, sources: cited, status, verification: verdict, cost });
          if (status === "posted") publishRow(id);
          return id;
        } catch (e) {
          if (/UNIQUE/i.test(String(e))) return null;
          throw e;
        }
      });
      if (!res) {
        logPost({ account: acct.user_id, slot, story: p.story.key, format, body: d.draft.body, sources: cited, status: "skipped", reason: "Another AI account already covered this story.", verification: verdict, cost });
        continue;
      }
      if (status === "posted") summary.posted++;
      else summary.queued++;
      notes.push(`${status} ${p.story.key}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logPost({ account: acct.user_id, slot, story: p.story.key, format, sources: p.sources, status: "error", reason: msg.slice(0, 300), cost });
      console.error(`[ai] @${acct.handle} failed on ${p.story.key}: ${msg.slice(0, 300)}`);
      // A bad key or a billing problem affects every account: stop this run.
      const status = (e as { status?: number }).status;
      if (status === 401 || status === 403) return { outcome: "stopped", note: "The Anthropic API rejected the key." };
      notes.push(`error ${p.story.key}`);
    }
  }
  return { outcome: "done", note: notes.join(", ") };
}

/** Create the visible dispatch for a logged (queued or just-approved) AI post. */
function publishRow(aiPostId: string) {
  const r = get<{ account_id: string; body: string; sources: string; post_id: string | null }>("SELECT account_id, body, sources, post_id FROM ai_posts WHERE id = ?", [aiPostId]);
  if (!r || r.post_id) return r?.post_id ?? null;
  const sources = JSON.parse(r.sources) as SourceDoc[];
  const lead = sources[0];
  let domain: string | null = null;
  try {
    domain = lead ? new URL(lead.url).hostname.replace(/^www\./, "") : null;
  } catch {
    domain = null;
  }
  const id = newId();
  const t = now();
  run(
    `INSERT INTO posts (id, author_id, body, link_url, link_title, link_domain, source_url, source_domain, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, r.account_id, r.body, lead?.url ?? null, lead?.title ?? null, domain, lead?.url ?? null, domain, t],
  );
  run("UPDATE ai_posts SET post_id = ?, status = 'posted' WHERE id = ?", [id, aiPostId]);
  return id;
}

// ------------------------------------------------------------------ Control Room actions

export function approveAiPost(aiPostId: string, adminId: string) {
  if (!aiSettings().enabled) throw new AppError("Turn the AI newsroom on before approving posts.");
  return tx(() => {
    const r = get<{ status: string }>("SELECT status FROM ai_posts WHERE id = ?", [aiPostId]);
    if (!r || r.status !== "queued") throw new AppError("That post is not waiting for approval.");
    run("UPDATE ai_posts SET decided_at = ?, decided_by = ? WHERE id = ?", [now(), adminId, aiPostId]);
    return publishRow(aiPostId);
  });
}

export function rejectAiPost(aiPostId: string, adminId: string) {
  const res = run("UPDATE ai_posts SET status = 'rejected', decided_at = ?, decided_by = ? WHERE id = ? AND status = 'queued'", [now(), adminId, aiPostId]);
  if (res.changes !== 1) throw new AppError("That post is not waiting for approval.");
}

/** Take down a published AI dispatch (it shows as deleted; the log keeps the record). */
export function deleteAiPost(aiPostId: string, adminId: string) {
  tx(() => {
    const r = get<{ post_id: string | null; status: string }>("SELECT post_id, status FROM ai_posts WHERE id = ?", [aiPostId]);
    if (!r || r.status !== "posted") throw new AppError("Only published posts can be deleted.");
    if (r.post_id) run("UPDATE posts SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL", [now(), r.post_id]);
    run("UPDATE ai_posts SET status = 'deleted', decided_at = ?, decided_by = ? WHERE id = ?", [now(), adminId, aiPostId]);
  });
}

export function updateAccount(userId: string, patch: { paused?: boolean; style?: string; hours?: string; maxPerHour?: number }) {
  if (!get("SELECT 1 FROM ai_accounts WHERE user_id = ?", [userId])) throw new AppError("Unknown AI account.");
  if (patch.paused !== undefined) run("UPDATE ai_accounts SET paused = ? WHERE user_id = ?", [patch.paused ? 1 : 0, userId]);
  if (patch.style !== undefined) {
    const s = patch.style.trim().slice(0, 1500);
    if (s.length < 20) throw new AppError("Write a style guide of at least a sentence.");
    run("UPDATE ai_accounts SET style_guide = ? WHERE user_id = ?", [s, userId]);
  }
  if (patch.hours !== undefined) {
    parseHours(patch.hours); // throws a readable error
    run("UPDATE ai_accounts SET post_hours = ? WHERE user_id = ?", [patch.hours.trim().toLowerCase() || "all", userId]);
  }
  if (patch.maxPerHour !== undefined) run("UPDATE ai_accounts SET max_per_hour = ? WHERE user_id = ?", [patch.maxPerHour >= 2 ? 2 : 1, userId]);
}

export type AiLogRow = {
  id: string;
  handle: string;
  slot: string;
  story_key: string | null;
  story_title: string | null;
  format: Format;
  body: string;
  sources: SourceDoc[];
  status: string;
  reason: string;
  verification: Partial<Verdict & { checks: string[] }>;
  post_id: string | null;
  cost_usd: number;
  created_at: number;
};

export function aiLog(opts: { status?: string; limit?: number } = {}): AiLogRow[] {
  const rows = all<Omit<AiLogRow, "sources" | "verification"> & { sources: string; verification: string }>(
    `SELECT a.id, u.handle, a.slot, a.story_key, s.title story_title, a.format, a.body, a.sources, a.status, a.reason, a.verification, a.post_id, a.cost_usd, a.created_at
     FROM ai_posts a JOIN users u ON u.id = a.account_id LEFT JOIN stories s ON s.key = a.story_key
     ${opts.status ? "WHERE a.status = ?" : ""} ORDER BY a.created_at DESC LIMIT ?`,
    [...(opts.status ? [opts.status] : []), opts.limit ?? 100],
  );
  return rows.map((r) => ({ ...r, sources: JSON.parse(r.sources || "[]"), verification: JSON.parse(r.verification || "{}") }));
}

export function aiCounts() {
  const rows = all<{ status: string; n: number }>("SELECT status, count(*) n FROM ai_posts GROUP BY status");
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
}

export const lastRuns = () =>
  new Map(all<{ account_id: string; slot: string; outcome: string; note: string }>("SELECT account_id, slot, outcome, note FROM ai_runs r WHERE slot = (SELECT max(slot) FROM ai_runs WHERE account_id = r.account_id)").map((r) => [r.account_id, { slot: r.slot, outcome: r.outcome, note: r.note }]));

// ------------------------------------------------------------------ readers

/** Source lists for AI dispatches, for the "AI-generated from these sources" line. */
export function aiSourcesFor(postIds: string[]): Map<string, { outlet: string; title: string; url: string }[]> {
  if (!postIds.length) return new Map();
  const rows = all<{ post_id: string; sources: string }>(`SELECT post_id, sources FROM ai_posts WHERE post_id IN (${postIds.map(() => "?").join(",")})`, postIds);
  return new Map(rows.map((r) => [r.post_id, (JSON.parse(r.sources) as SourceDoc[]).map((s) => ({ outlet: s.outlet, title: s.title, url: s.url }))]));
}

/** One-tap mute for every AI account (also mutes accounts added later, when the setting is re-applied). */
export function setAiMuted(userId: string, on: boolean) {
  tx(() => {
    const ids = all<{ id: string }>("SELECT id FROM users WHERE is_ai = 1").map((r) => r.id);
    if (on) {
      run("INSERT OR IGNORE INTO ai_mutes (user_id, created_at) VALUES (?, ?)", [userId, now()]);
      for (const id of ids) run("INSERT OR IGNORE INTO mutes (muter_id, muted_id, created_at) VALUES (?, ?, ?)", [userId, id, now()]);
    } else {
      run("DELETE FROM ai_mutes WHERE user_id = ?", [userId]);
      if (ids.length) run(`DELETE FROM mutes WHERE muter_id = ? AND muted_id IN (${ids.map(() => "?").join(",")})`, [userId, ...ids]);
    }
  });
}
export const aiMuted = (userId: string | null) => (userId ? !!get("SELECT 1 FROM ai_mutes WHERE user_id = ?", [userId]) : false);

export const DESKS = PERSONAS.map((p) => ({ slug: p.slug, handle: p.handle, name: p.name, niche: p.niche }));
