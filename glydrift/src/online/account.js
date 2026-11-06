// Accounts + cloud save (Supabase Auth). Nothing here is ever required to play:
//  - Everyone starts as an anonymous player (the leaderboard already signs in anonymously).
//  - CREATE ACCOUNT turns that same anonymous user into an email + password account, so the
//    player keeps their id, leaderboard entries and progress; the save is uploaded at once.
//  - SIGN IN on another device merges that device's progress with the cloud save, keeping
//    the most progress (see cloudSave.js), and restores everything.
//  - Sign in with Apple on the iOS app (native plugin), forgotten-password emails, password
//    change, log out, and "Delete my account" (server-side function that deletes all data).
// The cloud copy lives in table player_saves (one row per account, row-level security: only
// you can read or write your row). Until the migration is applied, accounts still work and
// the game says cloud save isn't available yet.
import { Save } from "../data/save.js";
import { TEST } from "../systems/testFlags.js";
import { Leaderboard } from "./leaderboard.js";
import { cloudPayload, mergeSaves, progressScore } from "./cloudSave.js";

const PUSH_DELAY_MS = 4000;

export class AccountError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

/** Human message for a Supabase auth / database error. */
function explain(err) {
  const m = `${err?.message || err || ""}`;
  if (/invalid login credentials/i.test(m)) return "Wrong email or password.";
  if (/already (been )?registered|already exists|email.*taken/i.test(m))
    return "That email already has an account — sign in instead.";
  if (/password.*(at least|short|weak)/i.test(m))
    return "Use a longer password (8+ characters).";
  if (/rate limit|too many/i.test(m))
    return "Too many tries — wait a minute and try again.";
  if (/email.*invalid|invalid.*email/i.test(m))
    return "That doesn't look like an email address.";
  if (/fetch|network|offline|timeout|abort/i.test(m))
    return "You're offline — try again online.";
  return m || "Something went wrong. Try again.";
}

/** The table or function the migration adds isn't there yet. */
function notSetUp(err) {
  return ["42P01", "PGRST205", "PGRST202", "42883"].includes(err?.code);
}

// ------------------------------------------------------------------ real backend (Supabase)
const supabaseBackend = {
  async sb() {
    return Leaderboard.session(); // restores the saved session, or signs in anonymously
  },
  async user() {
    const sb = await this.sb();
    const {
      data: { session },
    } = await sb.auth.getSession();
    const u = session?.user;
    return u
      ? {
          id: u.id,
          email: u.email || null,
          newEmail: u.new_email || null,
          anon: !!u.is_anonymous,
        }
      : null;
  },
  async createAccount(email, password) {
    const sb = await this.sb();
    // upgrade the anonymous user in place: same id, nothing lost
    const { data, error } = await sb.auth.updateUser(
      { email, password },
      { emailRedirectTo: siteUrl() },
    );
    if (error) throw error;
    return { confirmPending: !data.user?.email || data.user.email !== email };
  },
  async signIn(email, password) {
    const sb = await Leaderboard.client();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },
  async signInApple() {
    const { Capacitor, registerPlugin } = await import("@capacitor/core");
    if (Capacitor.getPlatform() !== "ios")
      throw new Error("Sign in with Apple is on iPhone.");
    const SignInWithApple = registerPlugin("SignInWithApple");
    const nonce = randomString(32);
    const res = await SignInWithApple.authorize({
      clientId: "com.glydrift.game",
      redirectURI: "https://glydrift.com/",
      scopes: "email",
      nonce: await sha256(nonce),
    });
    const sb = await Leaderboard.client();
    const { error } = await sb.auth.signInWithIdToken({
      provider: "apple",
      token: res.response.identityToken,
      nonce,
    });
    if (error) throw error;
  },
  async resetPassword(email) {
    const sb = await Leaderboard.client();
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: siteUrl(),
    });
    if (error) throw error;
  },
  async updatePassword(password) {
    const sb = await this.sb();
    const { error } = await sb.auth.updateUser({ password });
    if (error) throw error;
  },
  async signOut() {
    const sb = await Leaderboard.client();
    await sb.auth.signOut();
  },
  /** A recovery / confirmation link opened the game: adopt its session. */
  async adoptLinkSession(tokens) {
    const sb = await Leaderboard.client();
    const { error } = await sb.auth.setSession(tokens);
    if (error) throw error;
  },
  async loadSave(uid) {
    const sb = await this.sb();
    const { data, error } = await sb
      .from("player_saves")
      .select("save")
      .eq("user_id", uid)
      .maybeSingle();
    if (error) throw error;
    return data?.save || null;
  },
  async storeSave(uid, save, progress) {
    const sb = await this.sb();
    const { error } = await sb
      .from("player_saves")
      .upsert(
        { user_id: uid, save, progress, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    if (error) throw error;
  },
  /** Is the server set up for accounts (the accounts migration applied)? */
  async serverReady() {
    const sb = await this.sb();
    const { error } = await sb.from("player_saves").select("user_id").limit(1);
    if (error && notSetUp(error)) return false;
    if (error) throw error;
    return true;
  },
  async deleteAccount() {
    const sb = await this.sb();
    const { error } = await sb.rpc("delete_my_account");
    if (error) throw error;
    await sb.auth.signOut();
  },
};

// ------------------------------------------------------------------ test backend (?mockcloud)
// A stand-in server kept in localStorage, so tests can sign up, reload, sign in on a "new
// device" and delete an account without any network.
const MOCK_KEY = "glydrift.mockserver";
const mockBackend = {
  db() {
    try {
      return (
        JSON.parse(localStorage.getItem(MOCK_KEY)) || {
          users: {},
          session: null,
          n: 0,
        }
      );
    } catch {
      return { users: {}, session: null, n: 0 };
    }
  },
  put(db) {
    localStorage.setItem(MOCK_KEY, JSON.stringify(db));
  },
  async user() {
    const db = this.db();
    if (!db.session) {
      db.n++;
      db.session = { id: `anon-${db.n}`, anon: true, email: null };
      this.put(db);
    }
    return { ...db.session, newEmail: null };
  },
  async createAccount(email, password) {
    const db = this.db();
    if (db.users[email]) throw new Error("User already registered");
    if (password.length < 8)
      throw new Error("Password should be at least 8 characters");
    db.users[email] = { id: db.session.id, password, save: null };
    db.session = { id: db.session.id, anon: false, email };
    this.put(db);
    return { confirmPending: false };
  },
  async signIn(email, password) {
    const db = this.db();
    const u = db.users[email];
    if (!u || u.password !== password)
      throw new Error("Invalid login credentials");
    db.session = { id: u.id, anon: false, email };
    this.put(db);
  },
  async signInApple() {
    throw new Error("Sign in with Apple is on iPhone.");
  },
  async resetPassword() {},
  async updatePassword(password) {
    const db = this.db();
    db.users[db.session.email].password = password;
    this.put(db);
  },
  async signOut() {
    const db = this.db();
    db.session = null;
    this.put(db);
  },
  async adoptLinkSession() {},
  async loadSave(uid) {
    const u = Object.values(this.db().users).find((x) => x.id === uid);
    return u?.save || null;
  },
  async storeSave(uid, save) {
    const db = this.db();
    const u = Object.values(db.users).find((x) => x.id === uid);
    if (u) u.save = save;
    this.put(db);
  },
  async serverReady() {
    return !localStorage.getItem("glydrift.mockserver.notready");
  },
  async deleteAccount() {
    const db = this.db();
    delete db.users[db.session.email];
    db.session = null;
    this.put(db);
  },
};

function siteUrl() {
  return typeof location !== "undefined"
    ? location.origin + location.pathname
    : undefined;
}
function randomString(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => (b % 36).toString(36)).join("");
}
async function sha256(s) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(s),
  );
  return Array.from(new Uint8Array(buf), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

// ------------------------------------------------------------------ the service
class AccountService {
  constructor() {
    this.backend = TEST.mockcloud ? mockBackend : supabaseBackend;
    this.user = null; // { id, email, anon }
    this.cloud = "off"; // off | synced | syncing | offline | not-set-up
    this.pushTimer = null;
    this.listeners = new Set();
    // settles once init() has restored the session (screens wait for it before showing state)
    this.ready = new Promise((r) => (this.markReady = r));
  }

  get available() {
    return TEST.mockcloud || !TEST.offline;
  }
  get signedIn() {
    return !!this.user && !this.user.anon;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit() {
    for (const fn of this.listeners) fn(this);
  }

  /** Once at launch (in the background): restore the account and sync its save. */
  async init() {
    if (this.started) return this.ready;
    this.started = true;
    if (!this.available) return this.markReady();
    Save.onWrite(() => this.schedulePush());
    try {
      await this.handleLink();
      this.user = await this.backend.user();
      this.known = true; // the server answered: signed in or not is for certain
      if (this.signedIn) await this.pullAndMerge();
    } catch {
      this.cloud = this.signedIn ? "offline" : "off";
    }
    this.markReady();
    this.emit();
  }

  /** A password-recovery or email-confirmation link opened the game. */
  async handleLink() {
    if (
      typeof location === "undefined" ||
      !location.hash.includes("access_token")
    )
      return;
    const p = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, "", location.pathname + location.search);
    await this.backend.adoptLinkSession({
      access_token: p.get("access_token"),
      refresh_token: p.get("refresh_token"),
    });
    this.linkType = p.get("type"); // recovery | signup | email_change | magiclink
  }

  /** Merge the cloud save into this device's (keeping the most progress), then upload. */
  async pullAndMerge() {
    this.cloud = "syncing";
    this.emit();
    try {
      const cloud = await this.backend.loadSave(this.user.id);
      if (cloud) Save.replace(mergeSaves(Save.data, cloud));
      await this.pushNow();
    } catch (err) {
      this.cloud = notSetUp(err) ? "not-set-up" : "offline";
      this.emit();
    }
  }

  schedulePush() {
    if (!this.signedIn || this.pushing) return;
    clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(
      () => this.pushNow().catch(() => {}),
      PUSH_DELAY_MS,
    );
  }

  async pushNow() {
    if (!this.signedIn) return;
    clearTimeout(this.pushTimer);
    this.pushing = true;
    try {
      const save = cloudPayload(Save.data);
      await this.backend.storeSave(this.user.id, save, progressScore(save));
      this.cloud = "synced";
      this.lastSync = Date.now();
    } catch (err) {
      this.cloud = notSetUp(err) ? "not-set-up" : "offline";
      throw err;
    } finally {
      this.pushing = false;
      this.emit();
    }
  }

  // ---------------------------------------------------------------- actions (UI)
  /**
   * New sign-ups wait until the server side is set up (migrations + auth settings), so no
   * player gets a half-working account or a confirmation email that leads nowhere.
   */
  async ensureServer() {
    let ready;
    try {
      ready = await this.backend.serverReady();
    } catch (err) {
      throw new AccountError(explain(err));
    }
    if (!ready)
      throw new AccountError(
        "Accounts open soon — your progress is safe on this device until then.",
        "not-set-up",
      );
  }

  async createAccount(email, password) {
    await this.ensureServer();
    try {
      this.user ||= await this.backend.user();
      const res = await this.backend.createAccount(email.trim(), password);
      this.user = await this.backend.user();
      if (!res.confirmPending) await this.pushNow().catch(() => {});
      this.emit();
      return res;
    } catch (err) {
      throw new AccountError(explain(err));
    }
  }

  async signIn(email, password) {
    await this.ensureServer();
    try {
      await this.backend.signIn(email.trim(), password);
      this.user = await this.backend.user();
      Leaderboard.restart();
      await this.pullAndMerge();
      this.emit();
    } catch (err) {
      throw new AccountError(explain(err));
    }
  }

  async signInApple() {
    try {
      await this.backend.signInApple();
      this.user = await this.backend.user();
      Leaderboard.restart();
      await this.pullAndMerge();
      this.emit();
    } catch (err) {
      throw new AccountError(explain(err));
    }
  }

  async resetPassword(email) {
    try {
      await this.backend.resetPassword(email.trim());
    } catch (err) {
      throw new AccountError(explain(err));
    }
  }

  async changePassword(password) {
    try {
      await this.backend.updatePassword(password);
      this.linkType = null;
    } catch (err) {
      throw new AccountError(explain(err));
    }
  }

  /** Log out: the account keeps everything; this device starts fresh as a guest. */
  async logOut() {
    await this.pushNow().catch(() => {});
    await this.backend.signOut().catch(() => {});
    this.user = null;
    this.cloud = "off";
    Save.reset();
    Leaderboard.restart();
  }

  /** Delete the account and every piece of its data, here and on the server. */
  async deleteAccount() {
    try {
      clearTimeout(this.pushTimer);
      await this.backend.deleteAccount();
    } catch (err) {
      if (notSetUp(err))
        throw new AccountError(
          "Account deletion isn't set up on the server yet.",
          "not-set-up",
        );
      throw new AccountError(explain(err));
    }
    this.user = null;
    this.cloud = "off";
    Save.reset();
    Leaderboard.restart();
  }

  /** One line for Settings. */
  statusLine() {
    if (!this.available) return "Offline";
    if (!this.signedIn) return "Playing as a guest";
    const cloud = {
      synced: "saved to the cloud",
      syncing: "syncing…",
      offline: "offline — will sync later",
      "not-set-up": "cloud save not available yet",
      off: "",
    }[this.cloud];
    return `${this.user.email}${cloud ? ` · ${cloud}` : ""}`;
  }
}

export const Account = new AccountService();

// test builds only
if (TEST.on && typeof window !== "undefined")
  window.__glyAccount = { Account, mergeSaves };
