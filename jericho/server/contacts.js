// Saved contacts (data/contacts.json, git-ignored, local only): "save Luke's number as ...",
// "who's in my contacts", "delete Luke from contacts", and "call Luke". The full number is kept
// here because it's needed to dial; it never goes to the log (only the last 4 digits).
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./config.js";
import { logAction } from "./logger.js";
import { checkNumber, last4, normalizeNumber, speakNumber } from "./calls/policy.js";

const file = () => path.join(process.env.JERICHO_DATA_DIR || path.join(ROOT, "data"), "contacts.json");
const clean = (name) => String(name || "").replace(/\s+/g, " ").trim().slice(0, 60);
const key = (name) => clean(name).toLowerCase().replace(/['’]s$/, "").replace(/[^a-z0-9 ]/g, "");

export function listContacts() {
  try {
    const data = JSON.parse(fs.readFileSync(file(), "utf8"));
    return Array.isArray(data.contacts) ? data.contacts : [];
  } catch {
    return [];
  }
}

function save(contacts) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  const tmp = `${file()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ contacts }, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file());
}

/** The contact called `name`: exact, then a unique first-name or starts-with match. */
export function findContact(name) {
  const k = key(name);
  if (!k) return null;
  const all = listContacts();
  const exact = all.find((c) => key(c.name) === k);
  if (exact) return exact;
  const partial = all.filter((c) => key(c.name).split(" ")[0] === k || key(c.name).startsWith(k));
  return partial.length === 1 ? partial[0] : null;
}

export function saveContact(name, phoneNumber) {
  const n = clean(name);
  if (!n) return { ok: false, error: "What's the contact's name?" };
  const num = normalizeNumber(phoneNumber, "1");
  if (!num || num.startsWith("short:")) return { ok: false, error: "That doesn't look like a phone number." };
  const check = checkNumber(num);
  if (!check.ok) return { ok: false, error: check.reason };
  const contacts = listContacts().filter((c) => key(c.name) !== key(n));
  contacts.push({ name: n, number: check.number, savedAt: new Date().toISOString() });
  save(contacts);
  logAction("contact_saved", { nameLength: n.length, number: last4(check.number) });
  return { ok: true, saved: n, numberSpoken: speakNumber(check.number), howToSpeak: "Read the number back digit by digit so they can check it." };
}

export function deleteContact(name) {
  const found = findContact(name);
  if (!found) return { ok: false, error: `There's no contact called ${clean(name)}.` };
  save(listContacts().filter((c) => c !== found && key(c.name) !== key(found.name)));
  logAction("contact_deleted", { nameLength: found.name.length });
  return { ok: true, deleted: found.name };
}
