/* Gleyde AI chat assistant.
   Security: every piece of text (the visitor's and the model's) is shown with
   textContent and is never parsed as HTML. The only network calls go to this site's own /api/chat*.
   The conversation is kept in sessionStorage (this tab only) so it survives page changes. */
(() => {
  "use strict";
  if (window.gleydeChatLoaded) return;
  window.gleydeChatLoaded = true;

  const NOTICE =
    "This is an AI assistant. Chats are saved so the Gleyde team can follow up and improve the service. Please don't share passwords or sensitive info.";
  const GREETING =
    "Hey! I'm the Gleyde assistant, an AI that can answer questions about website security and what Gleyde does. What's on your mind?";
  const MAX_CHARS = 500;
  const MAX_HISTORY = 20;
  const KEY = "gleyde-chat-v1";

  /* ---------- state (sessionStorage, guarded: it can throw or be unavailable) ---------- */
  const newId = () =>
    crypto.randomUUID
      ? crypto.randomUUID()
      : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
          (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16),
        );
  const fresh = () => ({ sessionId: newId(), startPage: null, started: false, open: false, messages: [], shared: false });

  let state = fresh();
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (saved && typeof saved.sessionId === "string" && Array.isArray(saved.messages)) {
      state = { ...fresh(), ...saved, messages: saved.messages.filter((m) => m && typeof m.text === "string" && (m.role === "user" || m.role === "assistant")) };
    }
  } catch {
    /* storage blocked: the chat still works for this page view */
  }
  const save = () => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  };

  /* ---------- tiny DOM helper (text only, no HTML parsing) ---------- */
  const el = (tag, attrs = {}, ...children) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v == null) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else n.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of children) if (c) n.append(c);
    return n;
  };
  const svg = (path) => {
    const NS = "http://www.w3.org/2000/svg";
    const s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("aria-hidden", "true");
    s.setAttribute("focusable", "false");
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", path);
    s.append(p);
    return s;
  };
  const ICON_CHAT = "M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6c-.5.4-1.3.1-1.3-.6V16A2.5 2.5 0 0 1 4 13.5z";
  const ICON_CLOSE = "M6 6l12 12M18 6L6 18";
  const ICON_SEND = "M4 12l16-8-6 16-2.5-6.5z";

  /* ---------- build the widget ---------- */
  const launcher = el("button", {
    type: "button",
    class: "chat-launcher",
    "aria-label": "Open chat with the Gleyde AI assistant",
    "aria-expanded": "false",
    "aria-controls": "gleyde-chat",
  });
  launcher.append(svg(ICON_CHAT), el("span", { class: "chat-launcher-label", text: "Ask our AI" }));

  const closeBtn = el("button", { type: "button", class: "chat-icon-btn", "aria-label": "Close chat" });
  closeBtn.append(svg(ICON_CLOSE));

  const header = el(
    "div",
    { class: "chat-head" },
    el(
      "div",
      { class: "chat-title-wrap" },
      el("span", { class: "chat-title", id: "gleyde-chat-title", text: "Gleyde assistant" }),
      el("span", { class: "chat-badge", text: "AI" }),
    ),
    closeBtn,
  );

  // Consent screen
  const startBtn = el("button", { type: "button", class: "btn btn-gold chat-start", text: "Start chat" });
  const privacyLink = el("a", { href: "/privacy#chat", text: "How chats are handled" });
  const consentNote = el("p", { class: "chat-flash", role: "status", hidden: true });
  const consentView = el(
    "div",
    { class: "chat-consent" },
    consentNote,
    el("p", { class: "chat-notice", id: "gleyde-chat-notice", text: NOTICE }),
    startBtn,
    el("p", { class: "chat-fine" }, privacyLink),
  );

  // Conversation
  const log = el("div", { class: "chat-log", role: "log", "aria-live": "polite", "aria-label": "Chat messages", tabindex: "0" });
  const typing = el("p", { class: "chat-typing", hidden: true, text: "Thinking…" });
  const input = el("textarea", {
    id: "gleyde-chat-input",
    class: "chat-input",
    rows: "2",
    maxlength: String(MAX_CHARS),
    placeholder: "Ask about website or email security…",
    "aria-describedby": "gleyde-chat-count",
    autocomplete: "off",
  });
  const count = el("span", { class: "chat-count", id: "gleyde-chat-count", "aria-live": "off", text: `0 / ${MAX_CHARS}` });
  const sendBtn = el("button", { type: "submit", class: "chat-send", "aria-label": "Send message" });
  sendBtn.append(svg(ICON_SEND));
  const form = el(
    "form",
    { class: "chat-form", novalidate: true },
    el("label", { for: "gleyde-chat-input", class: "sr-only", text: "Your message to the AI assistant" }),
    input,
    el("div", { class: "chat-form-row" }, count, sendBtn),
  );
  const status = el("p", { class: "chat-status", role: "status" });

  // Share contact (only if the visitor chooses to)
  const shareBtn = el("button", { type: "button", class: "chat-link-btn", "aria-expanded": "false", "aria-controls": "gleyde-chat-contact", text: "Share my contact info" });
  const deleteBtn = el("button", { type: "button", class: "chat-link-btn", text: "Delete my chat" });
  const actions = el("div", { class: "chat-actions" }, shareBtn, deleteBtn);

  const cName = el("input", { id: "gleyde-chat-name", type: "text", maxlength: "100", autocomplete: "name", required: true });
  const cEmail = el("input", { id: "gleyde-chat-email", type: "email", maxlength: "254", autocomplete: "email", required: true });
  const cConsent = el("input", { id: "gleyde-chat-consent", type: "checkbox", required: true });
  const cSubmit = el("button", { type: "submit", class: "btn btn-gold chat-small-btn", text: "Send to the team" });
  const cCancel = el("button", { type: "button", class: "btn btn-ghost chat-small-btn", text: "Cancel" });
  const contactForm = el(
    "form",
    { class: "chat-contact", id: "gleyde-chat-contact", hidden: true, novalidate: true },
    el("p", { class: "chat-fine", text: "Only if you want a reply from the Gleyde team." }),
    el("label", { for: "gleyde-chat-name", text: "Name" }),
    cName,
    el("label", { for: "gleyde-chat-email", text: "Email" }),
    cEmail,
    el("div", { class: "chat-check" }, cConsent, el("label", { for: "gleyde-chat-consent", text: "I agree that Gleyde may contact me about this chat." })),
    el("div", { class: "chat-row" }, cSubmit, cCancel),
  );

  const dYes = el("button", { type: "button", class: "btn btn-gold chat-small-btn", text: "Yes, delete it" });
  const dNo = el("button", { type: "button", class: "btn btn-ghost chat-small-btn", text: "Keep it" });
  const deleteConfirm = el(
    "div",
    { class: "chat-confirm", hidden: true, role: "group", "aria-label": "Confirm deleting this chat" },
    el("p", { text: "Delete this whole chat from our records? This can't be undone." }),
    el("div", { class: "chat-row" }, dYes, dNo),
  );

  const chatView = el("div", { class: "chat-body", hidden: true }, log, typing, status, form, actions, contactForm, deleteConfirm);

  const panel = el(
    "div",
    { class: "chat-panel", id: "gleyde-chat", role: "dialog", "aria-modal": "false", "aria-labelledby": "gleyde-chat-title", "aria-describedby": "gleyde-chat-notice", hidden: true },
    header,
    consentView,
    chatView,
  );

  const root = el("div", { class: "chat-root" }, panel, launcher);

  /* ---------- rendering ---------- */
  const bubble = (role, text, extraClass = "") => {
    const who = role === "user" ? "You" : role === "assistant" ? "Gleyde AI" : "";
    const item = el("div", { class: `chat-msg chat-msg-${role} ${extraClass}`.trim() });
    if (who) item.append(el("span", { class: "sr-only", text: `${who}: ` }));
    item.append(el("p", { text })); // textContent only
    return item;
  };
  const renderAll = () => {
    log.replaceChildren(bubble("assistant", GREETING), ...state.messages.map((m) => bubble(m.role, m.text)));
    scrollDown();
  };
  const scrollDown = () => {
    log.scrollTop = log.scrollHeight;
  };
  const setStatus = (text, isError = false) => {
    status.textContent = text || "";
    status.classList.toggle("is-error", !!isError);
  };
  const updateCount = () => {
    const n = input.value.length;
    count.textContent = `${n} / ${MAX_CHARS}`;
    count.classList.toggle("is-near", n > MAX_CHARS - 50);
  };
  const showView = () => {
    consentView.hidden = state.started;
    chatView.hidden = !state.started;
    shareBtn.hidden = state.shared;
    if (state.started) panel.removeAttribute("aria-describedby");
    else panel.setAttribute("aria-describedby", "gleyde-chat-notice");
    if (state.started) renderAll();
  };

  /* ---------- open / close ---------- */
  const isOpen = () => !panel.hidden;
  const open = () => {
    panel.hidden = false;
    launcher.setAttribute("aria-expanded", "true");
    launcher.setAttribute("aria-label", "Close chat with the Gleyde AI assistant");
    root.classList.add("is-open");
    state.open = true;
    save();
    showView();
    (state.started ? input : startBtn).focus();
  };
  const close = () => {
    panel.hidden = true;
    launcher.setAttribute("aria-expanded", "false");
    launcher.setAttribute("aria-label", "Open chat with the Gleyde AI assistant");
    root.classList.remove("is-open");
    state.open = false;
    save();
    launcher.focus();
  };
  launcher.addEventListener("click", () => (isOpen() ? close() : open()));
  closeBtn.addEventListener("click", close);
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (!contactForm.hidden) toggleContact(false);
      else if (!deleteConfirm.hidden) toggleDelete(false);
      else close();
    }
  });

  startBtn.addEventListener("click", () => {
    state.started = true;
    if (!state.startPage) state.startPage = location.pathname.slice(0, 120);
    consentNote.hidden = true;
    save();
    showView();
    input.focus();
  });

  /* ---------- API ---------- */
  async function post(path, payload) {
    let res;
    try {
      res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
        credentials: "same-origin",
      });
    } catch {
      return { ok: false, error: "You seem to be offline. Check your connection and try again." };
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* non-JSON */
    }
    if (res.ok && data && data.ok) return data;
    const fallback = res.status === 429 ? "You're sending messages quickly. Try again in a few minutes." : "Something went wrong. Please try again.";
    return { ok: false, error: (data && typeof data.error === "string" && data.error) || fallback, fields: data && data.fields };
  }

  /* ---------- sending ---------- */
  let busy = false;
  input.addEventListener("input", updateCount);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    const text = input.value.trim();
    if (!text) return;
    if (text.length > MAX_CHARS) {
      setStatus(`Please keep messages under ${MAX_CHARS} characters.`, true);
      return;
    }
    busy = true;
    sendBtn.disabled = true;
    setStatus("");
    const pending = bubble("user", text, "is-pending");
    log.append(pending);
    input.value = "";
    updateCount();
    typing.hidden = false;
    scrollDown();

    const history = state.messages.slice(-MAX_HISTORY);
    const data = await post("/api/chat", { sessionId: state.sessionId, startPage: state.startPage, history, message: text });

    typing.hidden = true;
    busy = false;
    sendBtn.disabled = false;
    if (!data.ok) {
      pending.remove();
      input.value = text;
      updateCount();
      setStatus(data.error, true);
      input.focus();
      return;
    }
    // The server may have hidden a secret; store what it saw, not what was typed.
    const shown = data.redacted && typeof data.message === "string" ? data.message : text;
    state.messages.push({ role: "user", text: shown }, { role: "assistant", text: String(data.reply || "") });
    save();
    pending.replaceWith(bubble("user", shown));
    log.append(bubble("assistant", String(data.reply || "")));
    scrollDown();
    input.focus();
  });

  /* ---------- share contact ---------- */
  const fieldError = (inputEl, msg) => {
    inputEl.setAttribute("aria-invalid", msg ? "true" : "false");
  };
  function toggleContact(show) {
    contactForm.hidden = !show;
    shareBtn.setAttribute("aria-expanded", String(show));
    if (show) {
      toggleDelete(false);
      cName.focus();
    } else shareBtn.focus();
  }
  shareBtn.addEventListener("click", () => toggleContact(contactForm.hidden));
  cCancel.addEventListener("click", () => toggleContact(false));
  contactForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = cName.value.trim();
    const email = cEmail.value.trim();
    fieldError(cName, !name);
    fieldError(cEmail, !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus("Please add your name and a valid email.", true);
      return;
    }
    if (!cConsent.checked) {
      setStatus("Please tick the box so we're allowed to contact you.", true);
      cConsent.focus();
      return;
    }
    cSubmit.disabled = true;
    const data = await post("/api/chat/contact", { sessionId: state.sessionId, startPage: state.startPage, name, email, consent: true });
    cSubmit.disabled = false;
    if (!data.ok) {
      setStatus(data.error, true);
      return;
    }
    state.shared = true;
    save();
    contactForm.reset();
    contactForm.hidden = true;
    shareBtn.hidden = true;
    shareBtn.setAttribute("aria-expanded", "false");
    setStatus("Thanks! The Gleyde team will follow up by email.");
    input.focus();
  });

  /* ---------- delete my chat ---------- */
  function toggleDelete(show) {
    deleteConfirm.hidden = !show;
    if (show) {
      contactForm.hidden = true;
      shareBtn.setAttribute("aria-expanded", "false");
      dNo.focus();
    } else deleteBtn.focus();
  }
  deleteBtn.addEventListener("click", () => toggleDelete(true));
  dNo.addEventListener("click", () => toggleDelete(false));
  dYes.addEventListener("click", async () => {
    dYes.disabled = true;
    const data = await post("/api/chat/delete", { sessionId: state.sessionId });
    dYes.disabled = false;
    if (!data.ok) {
      setStatus(data.error, true);
      return;
    }
    deleteConfirm.hidden = true;
    state = { ...fresh(), open: true };
    save();
    setStatus("");
    consentNote.textContent = "Your chat was deleted. You can start a new one anytime.";
    consentNote.hidden = false;
    showView();
    startBtn.focus();
  });

  /* ---------- mount ---------- */
  const mount = () => {
    document.body.append(root);
    // Safety net: only show the chat once its styles are really loaded (e.g. never with an
    // old cached stylesheet), so it can't appear as unstyled buttons and text.
    if (getComputedStyle(root).position !== "fixed") {
      root.remove();
      return;
    }
    // Reopen on the next page only on larger screens; on phones the panel covers the page.
    if (state.open && window.matchMedia("(min-width: 561px)").matches) {
      panel.hidden = false;
      launcher.setAttribute("aria-expanded", "true");
      launcher.setAttribute("aria-label", "Close chat with the Gleyde AI assistant");
      root.classList.add("is-open");
      showView();
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
