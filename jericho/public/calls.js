// The /calls page: past phone calls with outcome, summary and transcript.
const $ = (id) => document.getElementById(id);
let token = "";
try { token = localStorage.getItem("jericho-token") || ""; } catch { /* private mode */ }

const OUTCOME = {
  booked: "Booked",
  info_obtained: "Got the info",
  not_available: "Not available",
  needs_callback: "Needs a callback",
  voicemail: "Voicemail",
  no_answer: "No answer",
  busy: "Busy",
  failed: "Didn't work out",
};

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
}

async function load() {
  try {
    const res = await fetch("/api/calls", { headers: { "x-jericho-token": token } });
    if (res.status === 401) throw new Error("Access token missing. Open Jericho once with ?token=… first.");
    const { calls, testMode } = await res.json();
    $("mode-hint").textContent = testMode
      ? "Test mode is on: calls are simulated and nothing is dialed. Saved in data/calls.json, never committed."
      : "Live mode: calls are placed through Twilio. Saved in data/calls.json, never committed.";
    const list = $("calls");
    list.replaceChildren();
    if (!calls.length) list.append(el("li", {}, el("span", { className: "empty" }, "No calls yet. Try “Jericho, call Luigi's and book a table for four at seven.”")));
    for (const c of calls) {
      const when = new Date(c.createdAt).toLocaleString();
      const mins = c.durationSec ? ` · ${Math.floor(c.durationSec / 60)}m ${c.durationSec % 60}s` : "";
      const head = el(
        "span",
        {},
        el("strong", {}, c.businessName),
        c.test ? el("span", { className: "badge" }, "test") : null,
        el("span", { className: "meta" }, `${when} · ${c.number}${mins}`),
        el("span", { className: "outcome" }, c.status === "ended" ? OUTCOME[c.outcome] || c.outcome : `In progress (${c.status})`),
        el("span", { className: "goal" }, c.goal),
        c.summary ? el("span", { className: "summary" }, c.summary) : null,
      );
      const lines = (c.transcript || []).map((t) => el("p", { className: `line ${t.who}` }, el("b", {}, t.who === "agent" ? "Jericho: " : "Them: "), t.text));
      const transcript = lines.length ? el("details", {}, el("summary", {}, "Transcript"), ...lines) : null;
      list.append(el("li", { className: "call" }, el("div", {}, head, transcript)));
    }
  } catch (e) {
    $("status").textContent = e.message;
  }
}

load();
setInterval(load, 5000); // calls in progress update by themselves
