/* Gleyde Technologies — site script.
   Loaded from <head> (no inline scripts anywhere, so the CSP can forbid them). */
(() => {
  "use strict";

  const root = document.documentElement;
  root.classList.remove("no-js");
  root.classList.add("js");

  /* Turnstile calls this once its script has loaded (see contact page). */
  let turnstileReady = false;
  let siteKey = null;
  let widgetId = null;

  function renderTurnstile() {
    const slot = document.getElementById("turnstile-slot");
    if (!slot || !turnstileReady || !siteKey || widgetId !== null) return;
    widgetId = window.turnstile.render(slot, {
      sitekey: siteKey,
      theme: "dark",
      action: slot.dataset.action || "contact",
    });
  }
  async function initTurnstile() {
    if (!document.getElementById("turnstile-slot")) return;
    try {
      const res = await fetch("/api/config", { headers: { Accept: "application/json" } });
      if (res.ok) {
        siteKey = (await res.json()).turnstileSiteKey || null;
        if (siteKey) renderTurnstile();
        else document.getElementById("turnstile-slot").hidden = true; // not configured yet: no empty gap
      }
    } catch {
      /* The server will report a missing challenge if this failed. */
    }
  }
  /* Shared with security-check.js */
  window.gleydeTurnstile = {
    configured: () => siteKey !== null,
    token: () => document.querySelector('[name="cf-turnstile-response"]')?.value || "",
    reset: () => {
      if (widgetId !== null && window.turnstile) window.turnstile.reset(widgetId);
    },
  };
  window.gleydeTurnstileReady = () => {
    turnstileReady = true;
    renderTurnstile();
  };

  function onReady() {
    /* Footer year */
    for (const el of document.querySelectorAll("[data-year]")) {
      el.textContent = String(new Date().getFullYear());
    }

    /* Mobile nav */
    const toggle = document.querySelector(".nav-toggle");
    const menu = document.getElementById("nav-menu");
    if (toggle && menu) {
      const setOpen = (open) => {
        toggle.setAttribute("aria-expanded", String(open));
        menu.classList.toggle("open", open);
      };
      toggle.addEventListener("click", () => {
        setOpen(toggle.getAttribute("aria-expanded") !== "true");
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") setOpen(false);
      });
      menu.addEventListener("click", (e) => {
        if (e.target.closest("a")) setOpen(false);
      });
    }

    /* Header border on scroll */
    const header = document.querySelector(".site-header");
    if (header) {
      const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 8);
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
    }

    /* Reveal on scroll */
    const items = document.querySelectorAll(".reveal");
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.classList.add("in");
              io.unobserve(entry.target);
            }
          }
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
      );
      for (const el of items) io.observe(el);
    } else {
      for (const el of items) el.classList.add("in");
    }

    initTurnstile();
    initContactForm();
  }

  /* ---------- Contact form ---------- */
  const LIMITS = { name: 100, email: 254, website: 200, message: 4000 };
  const FIELDS = ["name", "email", "website", "message", "consent"];
  /* Same wording as the server (functions/api/contact.js). */
  const MSG = {
    nameShort: "Please enter your name (at least 2 characters).",
    nameLong: `Please shorten your name to ${LIMITS.name} characters or fewer.`,
    email: "Please enter a valid email address, like name@yourbusiness.com.",
    emailMissing: "Please enter your email so we can reply.",
    website: "Please enter a valid website address, like yourbusiness.com, or leave it blank.",
    messageShort: "Please tell us a little more (at least 10 characters).",
    messageLong: `Please keep your message under ${LIMITS.message} characters.`,
    consent: "Please tick this box so we can reply to you.",
  };
  /* Used only when the server gives no message of its own. */
  const STATUS_FALLBACK = {
    403: "We couldn't confirm you're not a bot. Please complete the verification above the button again, then press Send.",
    429: "You've sent several messages in the past hour. Please wait an hour and try again.",
    500: "Something went wrong on our side. Please try again in a few minutes.",
  };
  const SENT = ["Message sent.", "Thank you. We'll reply within one business day, usually by email."];

  function validate(data) {
    const errors = {};
    if (!data.name || data.name.length < 2) errors.name = MSG.nameShort;
    else if (data.name.length > LIMITS.name) errors.name = MSG.nameLong;

    if (!data.email) errors.email = MSG.emailMissing;
    else if (data.email.length > LIMITS.email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) errors.email = MSG.email;

    if (data.website) {
      let ok = false;
      try {
        const u = new URL(/^https?:\/\//i.test(data.website) ? data.website : `https://${data.website}`);
        ok = /^https?:$/.test(u.protocol) && u.hostname.includes(".");
      } catch {
        ok = false;
      }
      if (!ok || data.website.length > LIMITS.website) errors.website = MSG.website;
    }

    if (!data.message || data.message.length < 10) errors.message = MSG.messageShort;
    else if (data.message.length > LIMITS.message) errors.message = MSG.messageLong;

    if (!data.consent) errors.consent = MSG.consent;
    return errors;
  }

  function showErrors(form, errors, only) {
    for (const name of only || FIELDS) {
      const input = form.elements[name];
      const slot = form.querySelector(`[data-error-for="${name}"]`);
      const msg = errors[name] ? String(errors[name]) : "";
      if (input) input.setAttribute("aria-invalid", msg ? "true" : "false");
      if (slot && slot.textContent !== msg) slot.textContent = msg;
    }
  }

  /* Status box: text only (never HTML). A title line is optional. */
  function setStatus(status, kind, text, title) {
    status.className = kind ? `form-status ${kind}` : "form-status";
    status.replaceChildren();
    if (title) {
      const strong = document.createElement("strong");
      strong.className = "status-title";
      strong.textContent = title;
      status.append(strong, document.createTextNode(" "));
    }
    if (text) status.append(document.createTextNode(text));
  }

  function readForm(form) {
    return {
      name: form.elements.name.value.trim(),
      email: form.elements.email.value.trim(),
      website: form.elements.website.value.trim(),
      message: form.elements.message.value.trim(),
      consent: form.elements.consent.checked,
      company_fax: form.elements.company_fax.value,
      started_at: form.elements.started_at.value,
      "cf-turnstile-response": form.elements["cf-turnstile-response"]?.value || "",
    };
  }

  async function initContactForm() {
    const form = document.getElementById("contact-form");
    if (!form) return;

    const status = document.getElementById("form-status");
    const button = form.querySelector('button[type="submit"]');
    const label = button.querySelector(".label");
    const idleLabel = label.textContent;
    form.elements.started_at.value = String(Date.now());
    let attempted = false;

    /* Non-JS fallback redirects back with ?status= (only these fixed values are used). */
    const params = new URLSearchParams(window.location.search);
    if (params.get("status") === "sent") setStatus(status, "ok", SENT[1], SENT[0]);
    else if (params.get("status") === "error") {
      setStatus(status, "err", "Please check the form and try again. If it keeps happening, try again in a few minutes.", "Your message wasn't sent.");
    }

    /* Arriving from a security check report: prefill the website and a short note. */
    const site = params.get("website");
    const score = Number(params.get("score"));
    if (site && site.length <= 200 && /^[a-z0-9.-]+$/i.test(site)) {
      form.elements.website.value = site;
      if (Number.isInteger(score) && score >= 0 && score <= 100 && !form.elements.message.value) {
        form.elements.message.value =
          `I ran the free Website Security Check on ${site} (score ${score}/100) and would like to book a full security audit.`;
      }
    }

    /* After a first attempt, update each field's message as it is corrected. */
    const recheck = (e) => {
      const name = e.target.name;
      if (!attempted || !FIELDS.includes(name)) return;
      if (e.type === "input" && e.target.getAttribute("aria-invalid") !== "true") return; // don't nag while typing
      showErrors(form, validate(readForm(form)), [name]);
    };
    form.addEventListener("input", recheck);
    form.addEventListener("change", recheck);
    form.addEventListener("focusout", recheck);

    const setBusy = (busy) => {
      button.disabled = busy;
      button.classList.toggle("is-busy", busy);
      form.setAttribute("aria-busy", String(busy));
      label.textContent = busy ? "Sending…" : idleLabel;
    };

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (button.disabled) return;
      attempted = true;
      setStatus(status, "", "");

      const data = readForm(form);
      const errors = validate(data);
      showErrors(form, errors);
      const count = Object.keys(errors).length;
      if (count) {
        setStatus(status, "err", count === 1 ? "Please fix the highlighted field." : `Please fix the ${count} highlighted fields.`);
        form.querySelector('[aria-invalid="true"]')?.focus();
        return;
      }
      if (!data["cf-turnstile-response"]) {
        setStatus(status, "err", siteKey
          ? "Please complete the quick verification above the Send button, then press Send again."
          : "Our contact form is being set up and can't send messages yet. Please try again soon.");
        status.focus();
        return;
      }

      setBusy(true);
      try {
        const res = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(data),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.ok) {
          form.reset();
          showErrors(form, {});
          attempted = false;
          form.elements.started_at.value = String(Date.now());
          setStatus(status, "ok", SENT[1], SENT[0]);
        } else {
          if (body.fields && typeof body.fields === "object") showErrors(form, body.fields);
          const fallback = STATUS_FALLBACK[res.status] || (res.status >= 500 ? STATUS_FALLBACK[500] : "Something went wrong. Please try again in a moment.");
          setStatus(status, "err", typeof body.error === "string" && body.error ? body.error : fallback);
        }
      } catch {
        setStatus(status, "err", "We couldn't reach our server. Please check your internet connection and try again.");
      } finally {
        setBusy(false);
        if (widgetId !== null && window.turnstile) window.turnstile.reset(widgetId);
        // Field errors from the server: go to the first one. Otherwise: go to the message.
        (form.querySelector('[aria-invalid="true"]') || status).focus();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady);
  } else {
    onReady();
  }
})();
