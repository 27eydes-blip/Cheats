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

  /* ---------- domain input ---------- */
  /* Turns what people paste ("https://www.Shop.com/about?x=1") into a bare domain ("shop.com").
     Display convenience only: the server validates everything again. */
  function cleanDomain(raw) {
    let v = String(raw || "").trim();
    if (!v) return "";
    if (/^[^\s/@]+@[^\s/@]+$/.test(v)) return v; // looks like an email address; leave it for the error message
    v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//i, ""); // scheme
    v = v.replace(/^[^/?#]*@/, ""); // user:pass@
    v = v.split(/[/?#\s]/)[0]; // path, query, fragment
    v = v.replace(/\.+$/, "").toLowerCase();
    v = v.replace(/^www\./, "");
    return v;
  }

  /* Same shape the server accepts: public domain name, no IP, no port. */
  function domainProblem(v) {
    if (!v) return "Enter your website address, like yourbusiness.com.";
    if (/^[^\s/@]+@[^\s/@]+$/.test(v)) return "That looks like an email address. Enter your website instead, like yourbusiness.com.";
    if (/:\d+$/.test(v)) return "Leave out the port number; just enter the domain, like yourbusiness.com.";
    let host;
    try {
      host = new URL(`https://${v}`).hostname; // converts international names to their ASCII form
    } catch {
      return "That doesn't look like a website address. Try something like yourbusiness.com.";
    }
    if (/^[\d.]+$/.test(host) || host.startsWith("[")) return "Enter a domain name rather than an IP address, like yourbusiness.com.";
    const labels = host.split(".");
    if (labels.length < 2) return "Add the ending too, like yourbusiness.com.";
    const tld = labels[labels.length - 1];
    if (!labels.every((l) => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(l)) || !/^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(tld)) {
      return "That doesn't look like a website address. Try something like yourbusiness.com.";
    }
    if (["localhost", "local", "internal", "lan", "home", "corp", "test", "example", "invalid", "onion", "arpa"].includes(tld)) {
      return "That's a private or test address, so there's nothing public to check.";
    }
    return null;
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
        "Book a full audit ", el("span", { class: "arrow", "aria-hidden": "true" }, "→")));
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
  const EMAILED = {
    sent: "We've emailed this report to you.",
    limit: "We've already emailed this address several reports today, so we didn't send another.",
    failed: "We couldn't send the email right now. Use Save as PDF instead.",
    unavailable: "Emailing reports isn't switched on yet. Use Save as PDF instead.",
  };

  function renderReport(container, report, meta) {
    container.replaceChildren();
    const score = Number(report.score) || 0;
    const grade = String(report.grade || "F").slice(0, 1);
    const gradeCls = { A: "pass", B: "pass", C: "warn", D: "warn" }[grade] || "fail";
    const prev = recordScan(report);

    const ring = el("div", { class: `grade-ring grade-big ${gradeCls}`, role: "img", "aria-label": `Grade ${grade}, score ${score} out of 100` },
      el("span", { class: "grade-letter" }, grade),
      el("span", { class: "grade-score" }, `${score}/100`));
    ring.style.setProperty("--pct", String(score)); // CSSOM, allowed under style-src 'self'

    const s = report.summary || {};
    const delta = prev ? score - Number(prev.score) : 0;
    container.append(el("div", { class: "report-head" },
      ring,
      el("div", { class: "report-head-text" },
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
          report.checkedUrl ? ` · ${report.checkedUrl}` : ""),
        meta.emailed && EMAILED[meta.emailed] ? el("p", { class: `small email-note ${meta.emailed}` }, EMAILED[meta.emailed]) : null)));

    /* 1. Top three fixes first */
    if (report.priorities?.length) {
      container.append(el("section", { class: "top-fixes", "aria-labelledby": "top-fixes-title" },
        el("h3", { id: "top-fixes-title" }, "Fix these first"),
        el("ol", {}, report.priorities.map((p) => el("li", {},
          el("h4", {}, String(p.title)),
          el("p", { class: "tags" },
            el("span", { class: `tag impact-${p.impact}` }, IMPACT[p.impact] || p.impact),
            p.effort ? el("span", { class: "tag" }, `⏱ ${p.effort}`) : null,
            p.who ? el("span", { class: "tag" }, String(p.who)) : null),
          el("p", {}, String(p.why)))))));
    }

    /* 2. One clear next step */
    container.append(ctaBlock(report));

    const toolbar = el("div", { class: "report-toolbar no-print" });
    const printBtn = el("button", { class: "btn btn-ghost", type: "button" }, "Save as PDF");
    printBtn.addEventListener("click", () => window.print());
    const againBtn = el("button", { class: "btn btn-ghost", type: "button" }, "Check another site");
    againBtn.addEventListener("click", () => {
      const form = document.getElementById("scan-form");
      form.hidden = false;
      document.querySelector(".scan-facts")?.removeAttribute("hidden");
      form.scrollIntoView({ behavior: "smooth" });
      document.getElementById("domain").focus();
    });
    toolbar.append(printBtn, againBtn);
    container.append(toolbar);

    if (report.industry?.note) {
      container.append(el("p", { class: "note industry-note" }, el("strong", {}, `For ${report.industry.label} businesses: `), String(report.industry.note)));
    }

    /* 3. The full list */
    container.append(el("h3", { class: "full-results-title" }, "All results"));
    for (const section of report.sections || []) container.append(sectionBlock(section));
    if (meta.verifyAvailable) container.append(verifyPanel(report, container));
    container.append(el("p", { class: "note" }, el("strong", {}, "About this check. "), String(report.disclaimer || "")));
    container.append(ctaBlock(report));

    container.hidden = false;
    const h2 = container.querySelector("h2");
    h2?.setAttribute("tabindex", "-1");
    h2?.focus();
  }

  /* ---------- progress while scanning ---------- */
  /* The scan runs as one request, so the list advances on a timer that matches a typical
     scan (about 15 seconds) and completes for real when the answer arrives. */
  function progressController() {
    const panel = document.getElementById("scan-progress");
    const items = [...panel.querySelectorAll(".progress-steps li")];
    const live = document.getElementById("progress-live");
    let timer = null;
    let i = 0;
    const set = (li, state, text) => {
      li.dataset.state = state;
      li.querySelector(".step-state").textContent = text;
    };
    const announce = (text) => { live.textContent = text; };
    function step() {
      if (i > 0) set(items[i - 1], "done", "Done");
      if (i < items.length) {
        set(items[i], "active", "Checking…");
        announce(`Checking ${items[i].querySelector(".step-label").textContent.toLowerCase()} (${i + 1} of ${items.length})`);
        i++;
        if (i < items.length) timer = setTimeout(step, 2800);
      }
    }
    return {
      start(domain) {
        clearTimeout(timer);
        i = 0;
        for (const li of items) set(li, "waiting", "Waiting");
        document.getElementById("scan-progress-domain").textContent = domain;
        panel.hidden = false;
        step();
      },
      finish() {
        clearTimeout(timer);
        for (const li of items) set(li, "done", "Done");
        announce("All checks finished. Showing your results.");
        panel.hidden = true;
      },
      stop() {
        clearTimeout(timer);
        announce("");
        panel.hidden = true;
      },
    };
  }

  /* ---------- friendly errors ---------- */
  function friendlyError(status, body) {
    if (status === 429) {
      return String(body.error || "You've reached the limit of free checks for now. Please try again in about an hour.");
    }
    if (status === 403 && /verif/i.test(body.error || "")) {
      return "The quick human check didn't go through (it may have expired). Wait for it to show a tick, then try again.";
    }
    if (status === 403) return "We couldn't accept that request. Please reload the page and try again.";
    if (status === 422) return String(body.error || "Please check the highlighted field.");
    if (status === 502) return String(body.error || "We couldn't reach that website right now. Please try again in a minute.");
    return "Something went wrong on our side. Please try again in a moment.";
  }

  function init() {
    const form = document.getElementById("scan-form");
    if (!form) return;
    const status = document.getElementById("scan-status");
    const results = document.getElementById("scan-results");
    const facts = document.querySelector(".scan-facts");
    const button = document.getElementById("scan-submit") || form.querySelector('button[type="submit"]');
    const label = button.querySelector(".label");
    const domainInput = form.elements.domain;
    const err = (name) => form.querySelector(`[data-error-for="${name}"]`);
    const progress = progressController();
    let busy = false;

    /* What still stands between the visitor and a scan, in plain words. */
    function missing() {
      const out = [];
      const problem = domainProblem(cleanDomain(domainInput.value));
      if (problem) out.push({ field: "domain", text: domainInput.value.trim() ? "a valid website address" : "your website address" });
      if (!form.elements.consent.checked) out.push({ field: "consent", text: "a tick in the box confirming it's your site" });
      const token = window.gleydeTurnstile?.token() || "";
      if (!token) {
        const st = window.gleydeTurnstile?.state?.() || "loading";
        out.push({ field: "turnstile", state: st, text: "the quick human check (it usually completes by itself in a moment)" });
      }
      return out;
    }

    function refreshButton() {
      const ready = !busy && missing().length === 0;
      button.setAttribute("aria-disabled", String(!ready));
      button.classList.toggle("is-ready", ready);
    }

    function showMissing(list) {
      status.className = "form-status err";
      const ts = list.find((m) => m.field === "turnstile");
      if (ts && (ts.state === "unavailable")) {
        status.textContent = "The free check isn't available right now. Please try again later, or contact us and we'll run it for you.";
        return;
      }
      if (ts && ts.state === "error") {
        status.textContent = "The quick human check couldn't load. Check your connection or turn off content blockers for this page, then reload.";
        return;
      }
      const parts = list.map((m) => m.text);
      const joined = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
      status.textContent = `Almost there. Still needed: ${joined}.`;
      const first = list[0];
      if (first.field === "domain") {
        const problem = domainProblem(cleanDomain(domainInput.value));
        err("domain").textContent = problem;
        domainInput.setAttribute("aria-invalid", "true");
        domainInput.focus();
      } else if (first.field === "consent") {
        form.elements.consent.focus();
      }
    }

    /* Clean pasted links into a bare domain. */
    domainInput.addEventListener("paste", () => {
      setTimeout(() => {
        domainInput.value = cleanDomain(domainInput.value);
        refreshButton();
      }, 0);
    });
    domainInput.addEventListener("blur", () => {
      const cleaned = cleanDomain(domainInput.value);
      if (cleaned !== domainInput.value) domainInput.value = cleaned;
      if (cleaned) {
        const problem = domainProblem(cleaned);
        err("domain").textContent = problem || "";
        domainInput.setAttribute("aria-invalid", problem ? "true" : "false");
      }
      refreshButton();
    });
    domainInput.addEventListener("input", () => {
      if (domainInput.getAttribute("aria-invalid") === "true" && !domainProblem(cleanDomain(domainInput.value))) {
        err("domain").textContent = "";
        domainInput.setAttribute("aria-invalid", "false");
      }
      refreshButton();
    });
    form.elements.consent.addEventListener("change", () => {
      if (form.elements.consent.checked) err("consent").textContent = "";
      refreshButton();
    });
    document.addEventListener("gleyde:turnstile", refreshButton);
    refreshButton();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (busy) return;
      status.className = "form-status";
      status.textContent = "";
      for (const n of ["domain", "consent", "email"]) if (err(n)) err(n).textContent = "";
      form.elements.email?.setAttribute("aria-invalid", "false");

      domainInput.value = cleanDomain(domainInput.value);
      const domain = domainInput.value;
      const email = form.elements.email ? form.elements.email.value.trim() : "";
      const industry = form.elements.industry ? form.elements.industry.value : "";

      const gaps = missing();
      if (gaps.length) {
        showMissing(gaps);
        refreshButton();
        return;
      }
      domainInput.setAttribute("aria-invalid", "false");
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        form.elements.email.setAttribute("aria-invalid", "true");
        err("email").textContent = "Please enter a valid email address, or leave it blank.";
        form.elements.email.focus();
        return;
      }

      const token = window.gleydeTurnstile.token();
      busy = true;
      refreshButton();
      const original = label.textContent;
      label.textContent = "Checking…";
      results.hidden = true;
      form.hidden = true;
      if (facts) facts.hidden = true;
      progress.start(domain);
      let ok = false;

      try {
        const res = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ domain, consent: true, email, industry, "cf-turnstile-response": token }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.ok && body.report) {
          ok = true;
          progress.finish();
          renderReport(results, body.report, body);
        } else {
          progress.stop();
          form.hidden = false;
          if (facts) facts.hidden = false;
          for (const [k, v] of Object.entries(body.fields || {})) if (err(k)) err(k).textContent = String(v);
          status.className = "form-status err";
          status.textContent = friendlyError(res.status, body);
          const firstBad = Object.keys(body.fields || {})[0];
          if (firstBad && form.elements[firstBad]) {
            form.elements[firstBad].setAttribute("aria-invalid", "true");
            form.elements[firstBad].focus();
          } else status.focus();
        }
      } catch {
        progress.stop();
        form.hidden = false;
        if (facts) facts.hidden = false;
        status.className = "form-status err";
        status.textContent = "We couldn't reach our server. Please check your connection and try again.";
        status.focus();
      } finally {
        busy = false;
        label.textContent = original;
        window.gleydeTurnstile?.reset();
        refreshButton();
        if (ok) form.hidden = true;
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
