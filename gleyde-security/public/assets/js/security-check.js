/* Free Website Security Check — page script.
   Builds the report with DOM APIs and textContent only (never innerHTML), so nothing
   in a report (including values copied from the scanned site's headers) can run as code. */
(() => {
  "use strict";

  const STATUS = {
    pass: { label: "Pass", cls: "pass" },
    warn: { label: "Needs work", cls: "warn" },
    fail: { label: "At risk", cls: "fail" },
    info: { label: "Info", cls: "info" },
    skip: { label: "Not checked", cls: "info" },
  };

  /* el("div", { class: "x" }, "text", child) — text children become text nodes. */
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else node.setAttribute(k, v);
    }
    for (const c of children) {
      if (c === null || c === undefined || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  function looksLikeDomain(v) {
    const host = v.trim().replace(/^[a-z]+:\/\//i, "").split(/[/?#]/)[0];
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) || /^[^\s./]+(\.[^\s./]+)+$/.test(host);
  }

  function renderReport(container, report, cached) {
    container.replaceChildren();
    const score = Number(report.score) || 0;
    const grade = String(report.grade || "F").slice(0, 1);
    const gradeCls = { A: "pass", B: "pass", C: "warn", D: "warn" }[grade] || "fail";

    const ring = el("div", { class: `grade-ring ${gradeCls}`, role: "img", "aria-label": `Grade ${grade}, score ${score} out of 100` },
      el("span", { class: "grade-letter" }, grade),
      el("span", { class: "grade-score" }, `${score}/100`));
    ring.style.setProperty("--pct", String(score)); // CSSOM, allowed under style-src 'self'

    const s = report.summary || {};
    const head = el("div", { class: "report-head" },
      ring,
      el("div", {},
        el("p", { class: "eyebrow" }, "Your results"),
        el("h2", {}, String(report.domain || "")),
        el("p", { class: "lede" }, String(report.headline || "")),
        el("p", { class: "report-counts" },
          el("span", { class: "chip pass" }, `${s.pass || 0} passed`),
          el("span", { class: "chip warn" }, `${s.warn || 0} need work`),
          el("span", { class: "chip fail" }, `${s.fail || 0} at risk`)),
        el("p", { class: "small" },
          `Checked ${new Date(report.scannedAt).toLocaleString()}${cached ? " (recent result)" : ""}`,
          report.checkedUrl ? ` · ${report.checkedUrl}` : "")));
    container.append(head);

    const cta = el("div", { class: "report-cta" },
      el("div", {},
        el("h3", {}, "Want us to fix these for you?"),
        el("p", {}, "A full audit goes far beyond this outside check: we test your site, plugins and logins (with your written permission) and fix what we find.")),
      el("a", {
        class: "btn btn-gold",
        href: `/contact?website=${encodeURIComponent(report.domain || "")}&score=${score}`,
      }, "Book a security audit ", el("span", { class: "arrow", "aria-hidden": "true" }, "→")));
    container.append(cta);

    for (const section of report.sections || []) {
      const list = el("ul", { class: "check-list" });
      for (const c of section.checks || []) {
        const st = STATUS[c.status] || STATUS.info;
        list.append(el("li", { class: `check ${st.cls}` },
          el("span", { class: `badge ${st.cls}` }, st.label),
          el("div", {},
            el("h4", {}, String(c.title || "")),
            el("p", {}, String(c.detail || "")),
            c.fix && c.status !== "pass" ? el("p", { class: "fix" }, el("strong", {}, "How to fix: "), String(c.fix)) : null)));
      }
      container.append(el("section", { class: "report-section" }, el("h3", {}, String(section.title || "")), list));
    }

    container.append(el("p", { class: "note" }, el("strong", {}, "About this check. "), String(report.disclaimer || "")));
    container.append(cta.cloneNode(true));
    container.hidden = false;
    container.querySelector("h2")?.setAttribute("tabindex", "-1");
    container.querySelector("h2")?.focus();
  }

  function init() {
    const form = document.getElementById("scan-form");
    if (!form) return;
    const status = document.getElementById("scan-status");
    const results = document.getElementById("scan-results");
    const button = form.querySelector('button[type="submit"]');
    const label = button.querySelector(".label");
    const domainErr = form.querySelector('[data-error-for="domain"]');
    const consentErr = form.querySelector('[data-error-for="consent"]');

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      status.className = "form-status";
      status.textContent = "";
      domainErr.textContent = "";
      consentErr.textContent = "";

      const domain = form.elements.domain.value.trim();
      const consent = form.elements.consent.checked;
      let bad = false;
      if (!looksLikeDomain(domain)) {
        domainErr.textContent = "Please enter your website's domain, like yourbusiness.com.";
        form.elements.domain.setAttribute("aria-invalid", "true");
        bad = true;
      } else form.elements.domain.setAttribute("aria-invalid", "false");
      if (!consent) {
        consentErr.textContent = "Please confirm this is your website (or you're allowed to check it).";
        bad = true;
      }
      if (bad) return;

      const token = window.gleydeTurnstile?.token() || "";
      if (!token) {
        status.className = "form-status err";
        status.textContent = window.gleydeTurnstile?.configured()
          ? "Please complete the quick verification above the button."
          : "The security check is still being set up and can't run checks yet. Please try again soon, or contact us and we'll run it for you.";
        return;
      }

      button.disabled = true;
      const original = label.textContent;
      label.textContent = "Checking… (about 10 seconds)";
      results.hidden = true;

      try {
        const res = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ domain, consent, "cf-turnstile-response": token }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.ok && body.report) {
          renderReport(results, body.report, body.cached);
        } else {
          if (body.fields?.domain) domainErr.textContent = String(body.fields.domain);
          status.className = "form-status err";
          status.textContent = String(body.error || "Something went wrong. Please try again in a moment.");
        }
      } catch {
        status.className = "form-status err";
        status.textContent = "We could not reach the server. Please check your connection and try again.";
      } finally {
        button.disabled = false;
        label.textContent = original;
        window.gleydeTurnstile?.reset();
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
