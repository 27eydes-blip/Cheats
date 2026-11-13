// Account screen (a DOM overlay so the phone's keyboard, password managers and autofill work):
// guest → CREATE ACCOUNT / SIGN IN (+ Sign in with Apple on iPhone, forgotten password);
// signed in → status, change password, log out, delete account; a password-reset link opens
// straight into "set a new password".
import { Account } from "../online/account.js";

const isIOSApp = () => {
  const cap = typeof window !== "undefined" ? window.Capacitor : null;
  return !!cap?.isNativePlatform?.() && cap.getPlatform?.() === "ios";
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Open the account screen. Resolves when it closes, with { reload } when the signed-in
 * player changed (the game then reloads so every screen shows the right progress).
 */
export async function openAccount({ view } = {}) {
  // opened right after launch: let the account service restore the session first
  Account.init();
  await Account.ready;
  const modal = document.getElementById("account-modal");
  const card = modal.querySelector(".card");
  if (!modal.dataset.bound) {
    modal.dataset.bound = "1";
    for (const type of [
      "pointerdown",
      "pointerup",
      "mousedown",
      "mouseup",
      "touchstart",
      "touchend",
      "keydown",
      "keyup",
    ])
      modal.addEventListener(type, (e) => e.stopPropagation());
  }
  let mode =
    view || (Account.linkType === "recovery" ? "newpass" : Account.signedIn ? "account" : "create");
  return new Promise((resolve) => {
    let reload = false;
    const close = () => {
      modal.classList.remove("open");
      card.innerHTML = "";
      for (const ms of [0, 120, 400]) setTimeout(() => window.scrollTo(0, 0), ms);
      resolve({ reload });
    };
    const busy = (on) => card.querySelectorAll("button, input").forEach((b) => (b.disabled = on));
    const say = (msg, ok = false) => {
      const e = card.querySelector(".err");
      if (e) {
        e.textContent = msg;
        e.classList.toggle("ok", ok);
      }
    };
    const field = (name) => card.querySelector(`[name="${name}"]`)?.value || "";

    const render = () => {
      if (mode === "account") {
        card.innerHTML = `
          <h2>ACCOUNT</h2>
          <p class="who">${esc(Account.user?.email || "")}</p>
          <p>${esc(Account.statusLine())}</p>
          <div class="stack">
            <button type="button" class="alt" data-act="to-newpass">CHANGE PASSWORD</button>
            <button type="button" class="alt" data-act="logout">LOG OUT</button>
            <button type="button" class="danger" data-act="to-delete">DELETE MY ACCOUNT</button>
          </div>
          <p class="err"></p>
          <button type="button" data-act="close">DONE</button>`;
      } else if (mode === "newpass") {
        card.innerHTML = `
          <h2>NEW PASSWORD</h2>
          <form class="stack" data-form="newpass">
            <input name="password" type="password" autocomplete="new-password" placeholder="New password (8+ characters)" />
            <button type="submit">SAVE PASSWORD</button>
          </form>
          <p class="err"></p>
          <button type="button" class="link" data-act="back">${Account.signedIn ? "Back" : "Close"}</button>`;
      } else if (mode === "forgot") {
        card.innerHTML = `
          <h2>FORGOT PASSWORD</h2>
          <p>We'll email you a link to set a new one.</p>
          <form class="stack" data-form="forgot">
            <input name="email" type="email" autocomplete="email" inputmode="email" placeholder="Email" />
            <button type="submit">SEND RESET LINK</button>
          </form>
          <p class="err"></p>
          <button type="button" class="link" data-act="to-signin">Back to sign in</button>`;
      } else if (mode === "delete") {
        card.innerHTML = `
          <h2>DELETE ACCOUNT</h2>
          <p>This permanently deletes your account and all its data: progress, coins, heroes,
          items, titles, Drift Pass progress, purchases and leaderboard entries. It can't be undone.</p>
          <form class="stack" data-form="delete">
            <input name="confirm" autocomplete="off" autocapitalize="characters" placeholder="Type DELETE to confirm" />
            <button type="submit" class="danger">DELETE FOREVER</button>
          </form>
          <p class="err"></p>
          <button type="button" class="link" data-act="to-account">Cancel</button>`;
      } else if (mode === "pending") {
        card.innerHTML = `
          <h2>CHECK YOUR EMAIL</h2>
          <p>We sent a confirmation link to <b>${esc(card.dataset.email)}</b>. Open it on this
          device to finish — your progress is already linked and keeps saving.</p>
          <button type="button" data-act="close">OK</button>`;
      } else {
        const create = mode === "create";
        card.innerHTML = `
          <h2>${create ? "CREATE ACCOUNT" : "SIGN IN"}</h2>
          <p>${create ? "Save your progress to the cloud and play on any device. Everything you've earned comes with you." : "Restore your progress on this device."}</p>
          <div class="tabs">
            <button type="button" class="alt ${create ? "" : "off"}" data-act="to-create">NEW</button>
            <button type="button" class="alt ${create ? "off" : ""}" data-act="to-signin">SIGN IN</button>
          </div>
          <form class="stack" data-form="${create ? "create" : "signin"}">
            <input name="email" type="email" autocomplete="email" inputmode="email" placeholder="Email" />
            <input name="password" type="password" autocomplete="${create ? "new-password" : "current-password"}" placeholder="${create ? "Password (8+ characters)" : "Password"}" />
            <button type="submit">${create ? "CREATE ACCOUNT" : "SIGN IN"}</button>
          </form>
          ${isIOSApp() ? `<button type="button" class="apple" data-act="apple"> Sign in with Apple</button>` : ""}
          <p class="err"></p>
          ${create ? "" : `<button type="button" class="link" data-act="to-forgot">Forgot password?</button>`}
          <button type="button" class="link" data-act="close">Not now</button>`;
      }
      card.querySelector("input")?.focus?.();
    };

    const run = async (fn) => {
      busy(true);
      say("");
      try {
        await fn();
      } catch (err) {
        if (err?.code !== "cancelled") say(err.message || "Something went wrong.");
      } finally {
        busy(false);
      }
    };

    card.onclick = (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (!act) return;
      if (act === "close") return close();
      if (act.startsWith("to-")) {
        mode = act.slice(3);
        return render();
      }
      if (act === "back") {
        mode = Account.signedIn ? "account" : "create";
        if (!Account.signedIn) return close();
        return render();
      }
      if (act === "logout")
        return run(async () => {
          await Account.logOut();
          reload = true;
          close();
        });
      if (act === "apple")
        return run(async () => {
          await Account.signInApple();
          reload = true;
          close();
        });
    };

    card.onsubmit = (e) => {
      e.preventDefault();
      const form = e.target.dataset.form;
      const email = field("email");
      const password = field("password");
      if (
        (form === "create" || form === "signin" || form === "forgot") &&
        !/^\S+@\S+\.\S+$/.test(email)
      )
        return say("Enter your email address.");
      if ((form === "create" || form === "newpass") && password.length < 8)
        return say("Use at least 8 characters.");
      if (form === "create")
        return run(async () => {
          const res = await Account.createAccount(email, password);
          card.dataset.email = email;
          mode = res.confirmPending ? "pending" : "account";
          render();
          if (!res.confirmPending) say("Account created — your progress is saved to it.", true);
        });
      if (form === "signin")
        return run(async () => {
          await Account.signIn(email, password);
          reload = true;
          close();
        });
      if (form === "forgot")
        return run(async () => {
          await Account.resetPassword(email);
          say("Check your email for a reset link.", true);
        });
      if (form === "newpass")
        return run(async () => {
          await Account.changePassword(password);
          mode = Account.signedIn ? "account" : "create";
          render();
          say("Password changed.", true);
        });
      if (form === "delete") {
        if (field("confirm").trim().toUpperCase() !== "DELETE")
          return say("Type DELETE to confirm.");
        return run(async () => {
          await Account.deleteAccount();
          reload = true;
          close();
        });
      }
    };

    render();
    modal.classList.add("open");
  });
}

// test builds only: open the account screen the way Settings → ACCOUNT does
import { TEST } from "../systems/testFlags.js";
if (TEST.on && typeof window !== "undefined")
  window.__glyOpenAccount = (view) =>
    openAccount({ view }).then(({ reload }) => reload && window.location.reload());
