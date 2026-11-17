/* Free Website Security Check — page script.
   Builds the report with DOM APIs and textContent only (never innerHTML), so nothing
   in a report (including values copied from the scanned site) can run as code. */
(() => {
  "use strict";

  const STATUS = {
    pass: { label: "Pass", cls: "pass" },
    warn: { label: "Needs work", cls: "warn" },
    fail: { label: "At risk", cls: "fail" },
    info: { label: "Info", cls: "info" },
    skip: { label: "Not checked", cls: "info" },
  };
  const IMPACT = { critical: "Critical", high: "High impact", medium: "Medium impact", low: "Low impact" };

  /* el("div", { class: "x" }, "text", child) — text children become text nodes. */
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "onclick") node.addEventListener("click", v);
      else node.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  function looksLikeDomain(v) {
    const host = v.trim().replace(/^[a-z]+:\/\//i, "").split(/[/?#]/)[0];
    return /^[^\s./]+(\.[^\s./]+)+$/.test(host);
  }

  /* ---------- progress history (this browser only) ---------- */
  const HISTORY_KEY = "gleyde-scan-history";
  function readHistory() {
    try {
      const h = JSON.parse(localStorage.getItem(HISTORY_KEY) || "{}");
      return h && typeof h === "object" ? h : {};
    } catch {
      return {};
    }
  }
  function recordScan(report) {
    const h = readHistory();
    const list = Array.isArray(h[report.domain]) ? h[report.domain] : [];
    const prev = list.length ? list[list.length - 1] : null;
    if (!prev || prev.at !== report.scannedAt) list.push({ score: report.score, grade: report.grade, at: report.scannedAt });
    h[report.domain] = list.slice(-6);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
    } catch {
      /* storage blocked: progress just isn't remembered */
    }
    return prev && prev.at !== report.scannedAt ? prev : null;
  }

  async function copy(btn, text) {
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "Copied";
    } catch {
      btn.textContent = "Select and copy";
    }
    setTimeout(() => { btn.textContent = "Copy"; }, 2000);
  }

  function snippetBlock(sn) {
    const code = el("code", {}, String(sn.code));
    const btn = el("button", { class: "copy-btn", type: "button" }, "Copy");
    btn.addEventListener("click", () => copy(btn, String(sn.code)));
    return el("div", { class: "snippet" },
      el("div", { class: "snippet-head" }, el("span", {}, String(sn.label)), btn),
      el("pre", { tabindex: "0", "aria-label": `Code: ${String(sn.label)}` }, code));
  }

  function checkItem(c) {
    const st = STATUS[c.status] || STATUS.info;
    const showFix = c.fix && c.status !== "pass" && c.status !== "skip";
    const tags = showFix && (c.impact || c.effort || c.who)
      ? el("p", { class: "tags" },
          c.impact ? el("span", { class: `tag impact-${c.impact}` }, IMPACT[c.impact] || c.impact) : null,
          c.effort ? el("span", { class: "tag" }, `⏱ ${c.effort}`) : null,
          c.who ? el("span", { class: "tag" }, String(c.who)) : null)
      : null;
    return el("li", { class: `check ${st.cls}` },
      el("span", { class: `badge ${st.cls}` }, st.label),
      el("div", {},
        el("h4", {}, String(c.title || "")),
        tags,
        el("p", {}, String(c.detail || "")),
        showFix ? el("p", { class: "fix" }, el("strong", {}, "How to fix: "), String(c.fix)) : null,
        ...(showFix ? (c.snippets || []).slice(0, 3).map(snippetBlock) : [])));
  }

  function sectionBlock(section) {
    return el("section", { class: "report-section" },
      el("h3", {}, String(section.title || "")),
      el("ul", { class: "check-list" }, (section.checks || []).map(checkItem)));
  }

  function ctaBlock(report) {
    return el("div", { class: "report-cta no-print" },
      el("div", {},
        el("h3", {}, "Want us to fix these for you?"),
        el("p", {}, "A full audit goes far beyond this outside check: we test your site, plugins and logins (with your written permission) and fix what we find.")),
      el("a", { class: "btn btn-gold", href: `/contact?website=${encodeURIComponent(report.domain || "")}&score=${Number(report.score) || 0}` },
        "Book a security audit ", el("span", { class: "arrow", "aria-hidden": "true" }, "→")));
  }

  /* ---------- owner verification ---------- */
  function verifyPanel(report, results) {
    const out = el("div", { class: "verify-body" });
    const status = el("p", { class: "form-status", role: "status", "aria-live": "polite" });
    const getBtn = el("button", { class: "btn btn-ghost", type: "button" }, "Get my verification code");

    function showInstructions(v) {
      out.replaceChildren(
        el("p", {}, "Add ONE of these, then press the button below. DNS changes can take a few minutes to appear."),
        el("p", { class: "meta-label" }, "Option 1: DNS record (at your DNS provider)"),
        snippetBlock({ label: `TXT record · Name: ${v.dns.name}`, code: v.dns.value }),
        el("p", { class: "meta-label" }, "Option 2: a file on your website"),
        snippetBlock({ label: `Create ${v.file.url} containing:`, code: v.file.contents }),
        runBtn, status);
    }

    const runBtn = el("button", { class: "btn btn-gold", type: "button" }, "I've added it: run verified checks");
    runBtn.addEventListener("click", async () => {
      status.className = "form-status";
      status.textContent = "";
      const token = window.gleydeTurnstile?.token() || "";
      if (!token) {
        status.className = "form-status err";
        status.textContent = "Please complete the quick verification at the top of the page first.";
        return;
      }
      runBtn.disabled = true;
      runBtn.textContent = "Checking ownership…";
      try {
        const res = await fetch("/api/deep-scan", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ domain: report.domain, "cf-turnstile-response": token }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.ok && body.section) {
          results.querySelector(".verified-section")?.remove();
          const sec = sectionBlock(body.section);
          sec.classList.add("verified-section");
          sec.prepend(el("p", { class: "eyebrow" }, `Verified owner (via ${body.verifiedVia === "dns" ? "DNS record" : "file"})`));
          results.querySelector(".verify-panel")?.after(sec);
          status.className = "form-status ok";
          status.textContent = "Ownership confirmed. Your verified results are below.";
          sec.querySelector("h3")?.setAttribute("tabindex", "-1");
          sec.querySelector("h3")?.focus();
        } else {
          status.className = "form-status err";
          status.textContent = String(body.error || "Something went wrong. Please try again in a moment.");
        }
      } catch {
        status.className = "form-status err";
        status.textContent = "We could not reach the server. Please try again.";
      } finally {
        runBtn.disabled = false;
        runBtn.textContent = "I've added it: run verified checks";
        window.gleydeTurnstile?.reset();
      }
    });

    getBtn.addEventListener("click", async () => {
      getBtn.disabled = true;
      try {
        const res = await fetch("/api/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ domain: report.domain }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.ok) showInstructions(body);
        else {
          status.className = "form-status err";
          status.textContent = String(body.error || "Something went wrong.");
          out.append(status);
        }
      } finally {
        getBtn.disabled = false;
      }
    });

    out.append(getBtn);
    return el("div", { class: "verify-panel no-print" },
      el("h3", {}, "Unlock deeper checks for your own site"),
      el("p", {}, "Prove you own this website and we'll also look for exposed login pages, public user lists, open folders, debug logs and more. These are still read-only checks: nothing is logged into or changed."),
      out);
  }

  /* ---------- report ---------- */
  function renderReport(container, report, meta) {
    container.replaceChildren();
    const score = Number(report.score) || 0;
    const grade = String(report.grade || "F").slice(0, 1);
    const gradeCls = { A: "pass", B: "pass", C: "warn", D: "warn" }[grade] || "fail";
    const prev = recordScan(report);

    const ring = el("div", { class: `grade-ring ${gradeCls}`, role: "img", "aria-label": `Grade ${grade}, score ${score} out of 100` },
      el("span", { class: "grade-letter" }, grade),
      el("span", { class: "grade-score" }, `${score}/100`));
    ring.style.setProperty("--pct", String(score)); // CSSOM, allowed under style-src 'self'

    const s = report.summary || {};
    const delta = prev ? score - Number(prev.score) : 0;
    container.append(el("div", { class: "report-head" },
      ring,
      el("div", {},
        el("p", { class: "eyebrow" }, "Your results"),
        el("h2", {}, String(report.domain || "")),
        el("p", { class: "lede" }, String(report.headline || "")),
        prev ? el("p", { class: `progress ${delta > 0 ? "up" : delta < 0 ? "down" : ""}` },
          delta > 0 ? `▲ Up ${delta} points` : delta < 0 ? `▼ Down ${-delta} points` : "No change",
          ` since your last check (${prev.grade}, ${Number(prev.score)}/100 on ${new Date(prev.at).toLocaleDateString()})`) : null,
        el("p", { class: "report-counts" },
          el("span", { class: "chip pass" }, `${s.pass || 0} passed`),
          el("span", { class: "chip warn" }, `${s.warn || 0} need work`),
          el("span", { class: "chip fail" }, `${s.fail || 0} at risk`)),
        el("p", { class: "small" },
          report.platform?.label ? `Detected: ${report.platform.label}` : null,
          report.platform?.label && report.emailProvider ? " · " : null,
          report.emailProvider ? `Email: ${report.emailProvider}` : null),
        el("p", { class: "small" },
          `Checked ${new Date(report.scannedAt).toLocaleString()}${meta.cached ? " (recent result)" : ""}`,
          report.checkedUrl ? ` · ${report.checkedUrl}` : ""))));

    const toolbar = el("div", { class: "report-toolbar no-print" });
    const printBtn = el("button", { class: "btn btn-ghost", type: "button" }, "Save as PDF");
    printBtn.addEventListener("click", () => window.print());
    const againBtn = el("button", { class: "btn btn-ghost", type: "button" }, "Check again");
    againBtn.addEventListener("click", () => {
      document.getElementById("domain").value = report.domain;
      document.getElementById("scan-form").scrollIntoView({ behavior: "smooth" });
      document.getElementById("domain").focus();
    });
    toolbar.append(printBtn, againBtn);
    const EMAILED = {
      sent: "We've emailed this report to you.",
      limit: "We've already emailed this address several reports today, so we didn't send another.",
      failed: "We couldn't send the email right now; use Save as PDF instead.",
      unavailable: "Emailing reports isn't switched on yet; use Save as PDF instead.",
    };
    if (meta.emailed && EMAILED[meta.emailed]) toolbar.append(el("p", { class: `small email-note ${meta.emailed}` }, EMAILED[meta.emailed]));
    container.append(toolbar);

    if (report.priorities?.length) {
      container.append(el("section", { class: "top-fixes" },
        el("h3", {}, "Your top fixes"),
        el("ol", {}, report.priorities.map((p) => el("li", {},
          el("h4", {}, String(p.title)),
          el("p", { class: "tags" },
            el("span", { class: `tag impact-${p.impact}` }, IMPACT[p.impact] || p.impact),
            p.effort ? el("span", { class: "tag" }, `⏱ ${p.effort}`) : null,
            p.who ? el("span", { class: "tag" }, String(p.who)) : null),
          el("p", {}, String(p.why)))))));
    }

    if (report.industry?.note) {
      container.append(el("p", { class: "note industry-note" }, el("strong", {}, `For ${report.industry.label} businesses: `), String(report.industry.note)));
    }

    container.append(ctaBlock(report));
    for (const section of report.sections || []) container.append(sectionBlock(section));
    if (meta.verifyAvailable) container.append(verifyPanel(report, container));
    container.append(el("p", { class: "note" }, el("strong", {}, "About this check. "), String(report.disclaimer || "")));
    container.append(ctaBlock(report));

    container.hidden = false;
    const h2 = container.querySelector("h2");
    h2?.setAttribute("tabindex", "-1");
    h2?.focus();
  }

  function init() {
    const form = document.getElementById("scan-form");
    if (!form) return;
    const status = document.getElementById("scan-status");
    const results = document.getElementById("scan-results");
    const button = form.querySelector('button[type="submit"]');
    const label = button.querySelector(".label");
    const err = (name) => form.querySelector(`[data-error-for="${name}"]`);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      status.className = "form-status";
      status.textContent = "";
      for (const n of ["domain", "consent", "email"]) if (err(n)) err(n).textContent = "";
      form.elements.email?.setAttribute("aria-invalid", "false");

      const domain = form.elements.domain.value.trim();
      const consent = form.elements.consent.checked;
      const email = form.elements.email ? form.elements.email.value.trim() : "";
      const industry = form.elements.industry ? form.elements.industry.value : "";
      let bad = false;
      if (!looksLikeDomain(domain)) {
        err("domain").textContent = "Please enter your website's domain, like yourbusiness.com.";
        form.elements.domain.setAttribute("aria-invalid", "true");
        bad = true;
      } else form.elements.domain.setAttribute("aria-invalid", "false");
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        form.elements.email.setAttribute("aria-invalid", "true");
        err("email").textContent = "Please enter a valid email address, or leave it blank.";
        bad = true;
      }
      if (!consent) {
        err("consent").textContent = "Please confirm this is your website (or you're allowed to check it).";
        bad = true;
      }
      if (bad) {
        (form.querySelector('[aria-invalid="true"]') || (!consent && form.elements.consent))?.focus();
        return;
      }

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
      label.textContent = "Checking… (about 15 seconds)";
      results.hidden = true;

      try {
        const res = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ domain, consent, email, industry, "cf-turnstile-response": token }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.ok && body.report) {
          renderReport(results, body.report, body);
        } else {
          for (const [k, v] of Object.entries(body.fields || {})) if (err(k)) err(k).textContent = String(v);
          const firstBad = Object.keys(body.fields || {})[0];
          if (firstBad && form.elements[firstBad]) form.elements[firstBad].focus();
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
