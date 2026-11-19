import assert from "node:assert/strict";
import { test } from "node:test";
import mailer, { IDLE_MS, RETENTION_MS, buildEmail, emailIdleSessions, escapeHtml, purgeOldSessions } from "../workers/chat-mailer/src/index.js";
import { FakeD1 } from "./helpers/fake-d1.js";

const NOW = Date.UTC(2026, 10, 18, 17, 0, 0);
const DAY = 24 * 3600 * 1000;

function seed(db, id, { created = NOW - 3600_000, last = NOW - IDLE_MS - 1, emailed = null, follow = 0, name = null, email = null, msgs = null } = {}) {
  db.raw.prepare(
    `INSERT INTO chat_sessions (id, created_at, last_activity_at, start_page, message_count, shared_contact, follow_up, contact_name, contact_email, emailed_at)
     VALUES (?, ?, ?, '/services', ?, ?, ?, ?, ?, ?)`,
  ).run(id, created, last, (msgs || []).length || 3, email ? 1 : 0, follow, name, email, emailed);
  const list = msgs || [["assistant", "Hey! I'm the Gleyde assistant, an AI."], ["user", "What is DMARC?"], ["assistant", "A lock on your email's return address."]];
  list.forEach(([role, content], i) => db.raw.prepare("INSERT INTO chat_messages (session_id, created_at, role, content) VALUES (?, ?, ?, ?)").run(id, created + i, role, content));
}

function resend({ ok = true } = {}) {
  const sent = [];
  const fetchImpl = async (url, init) => {
    sent.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return new Response(ok ? '{"id":"e1"}' : '{"error":"x"}', { status: ok ? 200 : 500 });
  };
  return { sent, fetchImpl };
}

const env = (db) => ({ CHAT_DB: db, RESEND_API_KEY: "test", OWNER_EMAIL: "owner@example.com", MAIL_FROM: "Gleyde Chat <chat@example.com>" });

test("emails each idle, un-emailed chat once and marks it emailed", async () => {
  const db = new FakeD1();
  seed(db, "idle-1");
  seed(db, "active", { last: NOW - 60_000 });
  seed(db, "done", { emailed: NOW - 1000 });
  const r = resend();
  const out = await emailIdleSessions(env(db), { now: NOW, fetchImpl: r.fetchImpl });
  assert.deepEqual(out, { sent: 1, failed: 0 });
  assert.equal(r.sent.length, 1);
  assert.equal(r.sent[0].url, "https://api.resend.com/emails");
  assert.deepEqual(r.sent[0].body.to, ["owner@example.com"]);
  assert.match(r.sent[0].body.text, /What is DMARC\?/);
  assert.equal(db.rows("SELECT emailed_at FROM chat_sessions WHERE id='idle-1'")[0].emailed_at, NOW);
  assert.equal(db.rows("SELECT emailed_at FROM chat_sessions WHERE id='active'")[0].emailed_at, null);
  // Second run: nothing new to send.
  assert.deepEqual(await emailIdleSessions(env(db), { now: NOW + 1000, fetchImpl: r.fetchImpl }), { sent: 0, failed: 0 });
});

test("a failed send leaves the chat unmarked so the next run retries", async () => {
  const db = new FakeD1();
  seed(db, "s1");
  const out = await emailIdleSessions(env(db), { now: NOW, fetchImpl: resend({ ok: false }).fetchImpl });
  assert.deepEqual(out, { sent: 0, failed: 1 });
  assert.equal(db.rows("SELECT emailed_at FROM chat_sessions")[0].emailed_at, null);
});

test("does nothing without its secrets", async () => {
  const db = new FakeD1();
  seed(db, "s1");
  const r = resend();
  assert.deepEqual(await emailIdleSessions({ ...env(db), RESEND_API_KEY: "" }, { now: NOW, fetchImpl: r.fetchImpl }), { sent: 0, failed: 0 });
  assert.equal(r.sent.length, 0);
});

test("email shows time, starting page, the transcript in order, and a clear Lead line", () => {
  const session = { id: "s1", created_at: NOW, start_page: "/security-check", message_count: 3, contact_name: "Jane Doe", contact_email: "jane@example.com", follow_up: 1 };
  const msgs = [
    { role: "assistant", content: "Hi, I'm an AI.", created_at: NOW },
    { role: "user", content: "first question", created_at: NOW + 1 },
    { role: "assistant", content: "first answer", created_at: NOW + 2 },
  ];
  const m = buildEmail(session, msgs);
  assert.match(m.text, /Chat started: Nov 18, 2026, 12:00\s?PM EST/);
  assert.match(m.text, /Starting page: \/security-check/);
  assert.match(m.text, /Lead: Jane Doe <jane@example\.com> \(asked for follow-up\)/);
  assert.ok(m.text.indexOf("first question") < m.text.indexOf("first answer"));
  assert.match(m.html, /Lead: Jane Doe &lt;jane@example\.com&gt;/);
  assert.equal(m.subject, "Chat lead: Jane Doe");
  const none = buildEmail({ ...session, contact_name: null, contact_email: null, follow_up: 0 }, msgs);
  assert.match(none.text, /Lead: none/);
});

test("all visitor text is HTML-escaped and kept out of the subject's line breaks", () => {
  const evil = `<img src=x onerror="alert(1)"><script>steal()</script> & 'quotes'`;
  const session = { id: "s1", created_at: NOW, start_page: "/", message_count: 1, contact_name: "Eve\r\nBcc: x@y.z <b>", contact_email: "eve@example.com", follow_up: 1 };
  const m = buildEmail(session, [{ role: "user", content: evil, created_at: NOW }]);
  assert.doesNotMatch(m.html, /<img|<script|<b>|onerror="/);
  assert.match(m.html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;&lt;script&gt;/);
  assert.match(m.html, /&amp; &#39;quotes&#39;/);
  assert.doesNotMatch(m.subject, /[\r\n]/);
  assert.equal(escapeHtml(`<>&"'`), "&lt;&gt;&amp;&quot;&#39;");
});

test("new activity after emailing is caught by the next run, and a race doesn't hide it", async () => {
  const db = new FakeD1();
  seed(db, "s1");
  const r = resend();
  // The visitor sends another message while the email is being sent.
  const racing = async (url, init) => {
    db.raw.prepare("UPDATE chat_sessions SET last_activity_at = ?, emailed_at = NULL WHERE id = 's1'").run(NOW + 5);
    return r.fetchImpl(url, init);
  };
  await emailIdleSessions(env(db), { now: NOW, fetchImpl: racing });
  assert.equal(db.rows("SELECT emailed_at FROM chat_sessions")[0].emailed_at, null, "still pending, so the update gets its own email");
});

test("daily purge deletes chats older than 30 days except follow-up leads", async () => {
  const db = new FakeD1();
  seed(db, "old", { created: NOW - RETENTION_MS - DAY });
  seed(db, "old-lead", { created: NOW - RETENTION_MS - DAY, follow: 1, name: "Jane", email: "j@example.com" });
  seed(db, "recent", { created: NOW - 5 * DAY });
  const out = await purgeOldSessions(env(db), { now: NOW });
  assert.equal(out.deleted, 1);
  assert.deepEqual(db.rows("SELECT id FROM chat_sessions ORDER BY id").map((r) => r.id), ["old-lead", "recent"]);
  assert.equal(db.rows("SELECT * FROM chat_messages WHERE session_id = 'old'").length, 0);
});

test("the scheduled handler routes the two crons", async () => {
  const db = new FakeD1();
  seed(db, "old", { created: Date.now() - RETENTION_MS - DAY });
  const waits = [];
  await mailer.scheduled({ cron: "23 4 * * *" }, env(db), { waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  assert.equal(db.rows("SELECT * FROM chat_sessions").length, 0);
});
