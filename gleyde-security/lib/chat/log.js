/* Chat logging to Cloudflare D1 (binding CHAT_DB). Kept apart from the reply code:
   every function here catches its own errors, so a logging failure never breaks the chat.
   Text arriving here has already been redacted. No IP address is ever written. */
import { GREETING } from "./prompt.js";

const EMAIL_IN_TEXT = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/i;

export async function logTurn(db, { sessionId, startPage, firstTurn, userText, assistantText, now = Date.now() }) {
  if (!db) return false;
  try {
    const email = (userText.match(EMAIL_IN_TEXT) || [])[0]?.toLowerCase() || null;
    const stmts = [
      db.prepare(
        "INSERT INTO chat_sessions (id, created_at, last_activity_at, start_page, message_count) VALUES (?1, ?2, ?2, ?3, 0) ON CONFLICT(id) DO NOTHING",
      ).bind(sessionId, now, startPage || null),
    ];
    if (firstTurn) {
      stmts.push(db.prepare("INSERT INTO chat_messages (session_id, created_at, role, content) VALUES (?1, ?2, 'assistant', ?3)").bind(sessionId, now - 2, GREETING));
    }
    stmts.push(
      db.prepare("INSERT INTO chat_messages (session_id, created_at, role, content) VALUES (?1, ?2, 'user', ?3)").bind(sessionId, now - 1, userText),
      db.prepare("INSERT INTO chat_messages (session_id, created_at, role, content) VALUES (?1, ?2, 'assistant', ?3)").bind(sessionId, now, assistantText),
      db.prepare(
        `UPDATE chat_sessions SET last_activity_at = ?2, message_count = message_count + ?3, emailed_at = NULL,
           shared_contact = MAX(shared_contact, ?4), contact_email = COALESCE(contact_email, ?5) WHERE id = ?1`,
      ).bind(sessionId, now, firstTurn ? 3 : 2, email ? 1 : 0, email),
    );
    await db.batch(stmts);
    return true;
  } catch (err) {
    console.error("chat log failed", err);
    return false;
  }
}

export async function saveContact(db, { sessionId, startPage, name, email, now = Date.now() }) {
  if (!db) return false;
  try {
    await db.batch([
      db.prepare(
        "INSERT INTO chat_sessions (id, created_at, last_activity_at, start_page, message_count) VALUES (?1, ?2, ?2, ?3, 0) ON CONFLICT(id) DO NOTHING",
      ).bind(sessionId, now, startPage || null),
      db.prepare("INSERT INTO chat_messages (session_id, created_at, role, content) VALUES (?1, ?2, 'system', ?3)").bind(
        sessionId, now, "The visitor shared their contact details and asked the Gleyde team to follow up.",
      ),
      db.prepare(
        `UPDATE chat_sessions SET shared_contact = 1, follow_up = 1, contact_name = ?2, contact_email = ?3,
           last_activity_at = ?4, message_count = message_count + 1, emailed_at = NULL WHERE id = ?1`,
      ).bind(sessionId, name || null, email, now),
    ]);
    return true;
  } catch (err) {
    console.error("chat contact save failed", err);
    return false;
  }
}

export async function deleteSession(db, sessionId) {
  if (!db) return false;
  try {
    await db.batch([
      db.prepare("DELETE FROM chat_messages WHERE session_id = ?1").bind(sessionId),
      db.prepare("DELETE FROM chat_sessions WHERE id = ?1").bind(sessionId),
    ]);
    return true;
  } catch (err) {
    console.error("chat delete failed", err);
    return false;
  }
}
