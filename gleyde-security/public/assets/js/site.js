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

  function validate(data) {
    const errors = {};
    if (!data.name || data.name.length < 2) errors.name = "Please enter your name.";
    else if (data.name.length > LIMITS.name) errors.name = "Name is too long.";

    if (!data.email) errors.email = "Please enter your email.";
    else if (data.email.length > LIMITS.email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email))
      errors.email = "Please enter a valid email address.";

    if (data.website) {
      let ok = false;
      try {
        const u = new URL(/^https?:\/\//i.test(data.website) ? data.website : `https://${data.website}`);
        ok = /^https?:$/.test(u.protocol) && u.hostname.includes(".");
      } catch {
        ok = false;
      }
      if (!ok || data.website.length > LIMITS.website) errors.website = "Please enter a valid website address.";
    }

    if (!data.message || data.message.length < 10) errors.message = "Please tell us a little more (10+ characters).";
    else if (data.message.length > LIMITS.message) errors.message = `Please keep it under ${LIMITS.message} characters.`;

    if (!data.consent) errors.consent = "Please confirm so we can reply to you.";
    return errors;
  }

  function showErrors(form, errors) {
    for (const name of ["name", "email", "website", "message", "consent"]) {
      const input = form.elements[name];
      const slot = form.querySelector(`[data-error-for="${name}"]`);
      const msg = errors[name] || "";
      if (input) input.setAttribute("aria-invalid", msg ? "true" : "false");
      if (slot) slot.textContent = msg;
    }
  }

  async function initContactForm() {
    const form = document.getElementById("contact-form");
    if (!form) return;

    const status = document.getElementById("form-status");
    const button = form.querySelector('button[type="submit"]');
    form.elements.started_at.value = String(Date.now());

    /* Non-JS fallback redirects back with ?status= */
    const params = new URLSearchParams(window.location.search);
    if (params.get("status") === "sent") {
      status.className = "form-status ok";
      status.textContent = "Thank you. Your message was received and we will reply within one business day.";
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

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      status.className = "form-status";
      status.textContent = "";

      const data = {
        name: form.elements.name.value.trim(),
        email: form.elements.email.value.trim(),
        website: form.elements.website.value.trim(),
        message: form.elements.message.value.trim(),
        consent: form.elements.consent.checked,
        company_fax: form.elements.company_fax.value,
        started_at: form.elements.started_at.value,
        "cf-turnstile-response": form.elements["cf-turnstile-response"]?.value || "",
      };

      const errors = validate(data);
      showErrors(form, errors);
      if (Object.keys(errors).length) {
        form.querySelector('[aria-invalid="true"]')?.focus();
        return;
      }
      if (!data["cf-turnstile-response"]) {
        status.className = "form-status err";
        status.textContent = siteKey
          ? "Please complete the quick verification above the button."
          : "Our contact form is being set up and can't send messages yet. Please try again soon.";
        return;
      }

      button.disabled = true;
      const label = button.querySelector(".label");
      const original = label.textContent;
      label.textContent = "Sending…";

      try {
        const res = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(data),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.ok) {
          form.reset();
          form.elements.started_at.value = String(Date.now());
          status.className = "form-status ok";
          status.textContent =
            "Thank you. Your message was received and we will reply within one business day.";
        } else {
          if (body.fields) showErrors(form, body.fields);
          status.className = "form-status err";
          status.textContent = body.error || "Something went wrong. Please try again in a moment.";
        }
      } catch {
        status.className = "form-status err";
        status.textContent = "We could not reach the server. Please check your connection and try again.";
      } finally {
        button.disabled = false;
        label.textContent = original;
        if (widgetId !== null && window.turnstile) window.turnstile.reset(widgetId);
        status.focus();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady);
  } else {
    onReady();
  }
})();
