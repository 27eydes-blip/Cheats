// The Planner page: week (default), day and month views of your planner and calendar,
// with free time shaded gold and a "This week" sidebar. Tap an empty slot to add, drag to move,
// tap homework to check it off. It reloads by itself when Jericho changes something by voice.
// Light on purpose: plain DOM, one render per change, no animation loops.
import { addDays, blockBox, clock, hhmmToMinutes, isoToLocal, layoutOverlaps, localToIso, shortHours, slotAt, weekdayOf } from "./plannerlayout.js";

// ---- access token (same as the main page) -----------------------------------------------------
const params = new URLSearchParams(location.search);
let token = "";
try {
  if (params.get("token")) localStorage.setItem("jericho-token", params.get("token"));
  token = localStorage.getItem("jericho-token") || "";
} catch {
  token = params.get("token") || "";
}
if (params.has("token")) history.replaceState(null, "", location.pathname + (params.get("embedded") ? "?embedded=1" : ""));
if (params.get("embedded") || window.top !== window) document.body.classList.add("embedded");

async function api(method, body) {
  const url = method === "GET" ? `/api/planner?${new URLSearchParams(body)}` : "/api/planner";
  const res = await fetch(url, { method, headers: { "content-type": "application/json", "x-jericho-token": token }, ...(method === "GET" ? {} : { body: JSON.stringify(body) }) });
  if (res.status === 401) throw new Error("Access token missing or wrong. Open Jericho once with ?token=… first.");
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.error) throw new Error(`The server answered ${res.status}.`);
  return data;
}

const $ = (id) => document.getElementById(id);
const el = (tag, cls = "", text = "") => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
};
const status = (t) => ($("pl-status").textContent = t || "");

const VIEW_KEY = "jericho-planner-view";
const state = { view: "week", date: "", data: null };
try {
  state.view = ["day", "week", "month"].includes(localStorage.getItem(VIEW_KEY)) ? localStorage.getItem(VIEW_KEY) : "week";
} catch {
  /* private mode */
}
const PX_PER_MIN = 54 / 60;
const tz = () => state.data?.settings?.tz || "America/Detroit";
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayNum = (d) => Number(d.slice(8));
const monthOf = (d) => MONTH[Number(d.slice(5, 7)) - 1];

// ---- loading ----------------------------------------------------------------------------------
let loading = null;
async function load() {
  const req = (loading = api("GET", { view: state.view, ...(state.date ? { date: state.date } : {}) }));
  try {
    const data = await req;
    if (req !== loading) return; // a newer load is on its way
    if (!data.ok) throw new Error(data.error || "Couldn't load the planner.");
    state.data = data;
    state.date ||= data.date;
    render();
    status(data.calendarNote && data.calendarNote !== "no calendar link set" ? `Calendar: ${data.calendarNote}.` : "");
  } catch (e) {
    status(e.message);
  }
}

async function change(body, ok = "") {
  try {
    const r = await api("POST", body);
    if (!r.ok) throw new Error(r.error || r.ask || "That didn't work.");
    status(r.say || ok);
    await load();
    return r;
  } catch (e) {
    status(e.message);
    return null;
  }
}

// ---- rendering --------------------------------------------------------------------------------
function render() {
  const d = state.data;
  document.querySelectorAll(".pl-views [data-view]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === state.view)));
  $("pl-range").textContent =
    state.view === "month" ? `${monthOf(state.date)} ${state.date.slice(0, 4)}` : d.from === d.to ? `${DAY[weekdayOf(d.from)]} ${monthOf(d.from)} ${dayNum(d.from)}` : `${monthOf(d.from)} ${dayNum(d.from)} – ${monthOf(d.to)} ${dayNum(d.to)}`;
  const grid = $("pl-grid");
  grid.replaceChildren(state.view === "month" ? renderMonth(d) : renderTimeGrid(d));
  renderSide(d.summary);
  if (state.view !== "month" && !grid.dataset.scrolled) {
    grid.dataset.scrolled = "1";
    const now = grid.querySelector(".pl-now");
    if (now) grid.scrollTop = Math.max(0, now.offsetTop - 120);
  }
}

function renderTimeGrid(d) {
  const wakeStart = hhmmToMinutes(d.settings.wakeStart);
  const wakeEnd = hhmmToMinutes(d.settings.wakeEnd);
  const timed = d.items.filter((o) => !o.allDay && o.type !== "homework");
  // show items outside waking hours too (an early class)
  let dayStart = wakeStart;
  let dayEnd = wakeEnd;
  for (const o of timed) {
    const s = isoToLocal(o.start, tz());
    const e = isoToLocal(o.end, tz());
    if (s.date === o.date) dayStart = Math.min(dayStart, Math.floor(s.minutes / 60) * 60);
    if (e.date === o.date) dayEnd = Math.max(dayEnd, Math.ceil(e.minutes / 60) * 60);
  }
  const days = d.days.map((x) => x.date);
  const root = el("div", "pl-cols");
  root.style.setProperty("--days", days.length);
  const box = { pxPerMin: PX_PER_MIN, dayStart, dayEnd };

  root.append(el("div", "pl-corner"));
  for (const date of days) {
    const h = el("div", `pl-dayhead${date === d.today ? " today" : ""}`, DAY[weekdayOf(date)]);
    h.append(el("span", "num", String(dayNum(date))));
    root.append(h);
  }
  // all-day row: all-day events and homework (by due date)
  root.append(el("div", "pl-allday-label", "Due · all day"));
  for (const date of days) {
    const cell = el("div", "pl-allday");
    cell.dataset.date = date;
    for (const o of d.items.filter((x) => x.date === date && (x.allDay || x.type === "homework"))) cell.append(chip(o));
    root.append(cell);
  }
  // hours
  const hours = el("div", "pl-hours");
  for (let m = dayStart; m < dayEnd; m += 60) hours.append(el("div", "pl-hour", clock(m)));
  root.append(hours);
  const nowLocal = isoToLocal(new Date().toISOString(), tz());
  for (const day of d.days) {
    const col = el("div", `pl-col${day.date < d.today ? " past" : ""}`);
    col.dataset.date = day.date;
    col.dataset.start = String(dayStart);
    col.dataset.end = String(dayEnd);
    col.style.height = `${(dayEnd - dayStart) * PX_PER_MIN}px`;
    for (const f of day.free) {
      const s = isoToLocal(f.start, tz()).minutes;
      const e = isoToLocal(f.end, tz()).minutes || 1440;
      const b = blockBox(s, e, { ...box, minHeight: 0 });
      const shade = el("div", "pl-free");
      shade.style.top = `${b.top}px`;
      shade.style.height = `${b.height}px`;
      shade.title = `Free ${clock(s)} to ${clock(e % 1440)}`;
      col.append(shade);
    }
    const mine = timed.filter((o) => o.date === day.date);
    const spans = mine.map((o) => {
      const s = isoToLocal(o.start, tz());
      const e = isoToLocal(o.end, tz());
      return { start: s.minutes, end: e.date === day.date ? e.minutes : 1440 };
    });
    const lanes = layoutOverlaps(spans);
    mine.forEach((o, i) => {
      const b = blockBox(spans[i].start, spans[i].end, box);
      const n = el("div", `pl-item ${o.source === "calendar" ? "calendar" : o.type}${o.status === "draft" ? " draft" : ""}`);
      n.style.top = `${b.top}px`;
      n.style.height = `${b.height}px`;
      n.style.left = `calc(${(lanes[i].col / lanes[i].cols) * 100}% + 2px)`;
      n.style.width = `calc(${100 / lanes[i].cols}% - 4px)`;
      n.append(el("span", "t", o.title), el("span", "s", `${clock(spans[i].start)}${o.status === "draft" ? " · draft" : ""}${o.source === "calendar" ? " · calendar" : ""}`));
      n.title = `${o.title}, ${clock(spans[i].start)} to ${clock(spans[i].end % 1440)}`;
      n.dataset.key = o.key;
      if (!o.readOnly) makeDraggable(n, o);
      col.append(n);
    });
    if (day.date === nowLocal.date && nowLocal.minutes >= dayStart && nowLocal.minutes <= dayEnd) {
      const line = el("div", "pl-now");
      line.style.top = `${(nowLocal.minutes - dayStart) * PX_PER_MIN}px`;
      col.append(line);
    }
    col.addEventListener("click", (e) => {
      if (e.target !== col && !e.target.classList.contains("pl-free")) return;
      const y = e.clientY - col.getBoundingClientRect().top;
      openSheet({ date: day.date, minutes: slotAt(y, { pxPerMin: PX_PER_MIN, startMin: dayStart, endMin: dayEnd }) });
    });
    root.append(col);
  }
  return root;
}

function chip(o) {
  const c = el("div", `pl-chip ${o.source === "calendar" ? "calendar" : o.type}${o.done ? " done" : ""}${o.overdue ? " overdue" : ""}`, o.title);
  c.title = o.type === "homework" ? `${o.title}${o.subject ? ` (${o.subject})` : ""}, due ${clock(isoToLocal(o.start, tz()).minutes)}, about ${o.minutes} min${o.overdue ? ", overdue" : ""}` : o.title;
  c.dataset.key = o.key;
  if (!o.readOnly) makeDraggable(c, o);
  return c;
}

function renderMonth(d) {
  const root = el("div", "pl-month");
  const start = d.settings.weekStartsOn ?? 1;
  for (let i = 0; i < 7; i++) root.append(el("div", "pl-mhead", DAY[(start + i) % 7]));
  const thisMonth = state.date.slice(0, 7);
  for (const day of d.days) {
    const cell = el("div", `pl-mday${day.date.slice(0, 7) !== thisMonth ? " other" : ""}${day.date === d.today ? " today" : ""}`);
    cell.dataset.date = day.date;
    cell.append(el("span", "pl-mnum", String(dayNum(day.date))));
    const items = d.items.filter((o) => o.date === day.date && o.type !== "class" && !(o.type === "study_block" && o.status === "draft"));
    for (const o of items.slice(0, 3)) cell.append(chip(o));
    if (items.length > 3) cell.append(el("span", "pl-more", `+${items.length - 3} more`));
    if (day.freeMinutes) cell.append(el("span", "pl-mfree", `${shortHours(day.freeMinutes)} free`));
    cell.addEventListener("click", (e) => {
      if (e.target.closest(".pl-chip")) return;
      state.view = "day";
      state.date = day.date;
      load();
    });
    root.append(cell);
  }
  return root;
}

function renderSide(s) {
  $("pl-work").textContent = shortHours(s.workLeftMinutes);
  $("pl-free").textContent = shortHours(s.freeByDay.reduce((a, b) => a + b.freeMinutes, 0));
  const list = $("pl-homework");
  list.replaceChildren();
  if (!s.homework.length) list.append(el("li", "pl-empty", "No homework this week."));
  for (const h of s.homework) {
    const li = el("li", `${h.done ? "done" : ""}${h.overdue ? " overdue" : ""}`);
    const box = el("input");
    box.type = "checkbox";
    box.checked = h.done;
    box.setAttribute("aria-label", `Done: ${h.title}`);
    box.addEventListener("change", () => change({ op: "toggle", id: h.id }));
    const text = el("div", "", h.title);
    const due = isoToLocal(h.due, tz());
    text.append(el("span", "due", `${h.overdue ? "Overdue · " : ""}${DAY[weekdayOf(due.date)]} ${monthOf(due.date)} ${dayNum(due.date)}${due.minutes === 1439 ? "" : `, ${clock(due.minutes)}`} · ${shortHours(h.minutes)}${h.subject ? ` · ${h.subject}` : ""}`));
    li.append(box, text);
    list.append(li);
  }
  const bars = $("pl-freebars");
  bars.replaceChildren();
  const max = Math.max(60, ...s.freeByDay.map((x) => x.freeMinutes));
  for (const f of s.freeByDay) {
    const li = el("li");
    const bar = el("div", "pl-bar");
    const fill = el("span");
    fill.style.width = `${Math.round((f.freeMinutes / max) * 100)}%`;
    bar.append(fill);
    li.append(el("span", "", DAY[weekdayOf(f.date)]), bar, el("span", "", shortHours(f.freeMinutes)));
    bars.append(li);
  }
  const drafts = (state.data?.items || []).filter((o) => o.type === "study_block" && o.status === "draft").length;
  $("pl-accept").hidden = !drafts;
  $("pl-reject").hidden = !drafts;
  $("pl-plan-note").textContent = drafts ? `${drafts} draft study block${drafts === 1 ? "" : "s"}: drag to change, then accept or reject.` : "Draft study blocks before each due date. Nothing is kept until you accept it.";
}

// ---- drag to move, tap to check off or edit ------------------------------------------------------
function makeDraggable(node, o) {
  node.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    node.setPointerCapture(e.pointerId);
    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 6) return;
      moved = true;
      node.classList.add("dragging");
      node.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const onUp = (ev) => {
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerup", onUp);
      node.removeEventListener("pointercancel", onUp);
      node.classList.remove("dragging");
      node.style.transform = "";
      if (ev.type === "pointercancel") return;
      if (!moved) return tap(o);
      node.style.visibility = "hidden";
      const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-date]");
      node.style.visibility = "";
      if (target) drop(o, target, ev.clientY);
    };
    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerup", onUp);
    node.addEventListener("pointercancel", onUp);
  });
}

function drop(o, target, clientY) {
  const date = target.dataset.date;
  let minutes;
  if (target.classList.contains("pl-col")) {
    const top = target.getBoundingClientRect().top;
    // the block's top follows the pointer, minus where it was grabbed (roughly its top)
    minutes = slotAt(clientY - top, { pxPerMin: PX_PER_MIN, startMin: Number(target.dataset.start), endMin: Number(target.dataset.end) });
  } else {
    minutes = isoToLocal(o.start, tz()).minutes; // a day cell or the due row: same time, new day
  }
  if (o.type === "homework" && target.classList.contains("pl-col")) minutes = isoToLocal(o.start, tz()).minutes === 1439 ? 1439 : minutes;
  const body = { op: "move", id: o.id, start: localToIso(date, minutes, tz()) };
  if (o.type === "class") body.fromDay = weekdayOf(o.date);
  change(body, "Moved.");
}

function tap(o) {
  if (o.readOnly) return;
  if (o.type === "homework") return change({ op: "toggle", id: o.id });
  if (o.type === "study_block" && o.status === "draft") {
    if (confirm(`Keep this study block (${o.title})? Cancel drops it.`)) change({ op: "accept", which: o.id });
    else change({ op: "reject", which: o.id });
    return;
  }
  openSheet({ item: o });
}

// ---- add / edit sheet ----------------------------------------------------------------------------
const sheet = $("pl-sheet");
const form = $("pl-form");
let editing = null;

function showFields() {
  const type = form.type.value;
  form.querySelectorAll("[data-for]").forEach((l) => (l.hidden = !l.dataset.for.split(" ").includes(type)));
  form.days.required = type === "class";
}
form.type.addEventListener("change", showFields);

function openSheet({ date, minutes, item } = {}) {
  editing = item || null;
  form.reset();
  $("pl-sheet-title").textContent = item ? "Edit" : "Add";
  $("pl-delete").hidden = !item;
  form.type.disabled = Boolean(item);
  if (item) {
    const s = isoToLocal(item.start, tz());
    form.type.value = item.type;
    form.title.value = item.title;
    form.subject.value = item.subject || "";
    form.date.value = s.date;
    form.time.value = `${String(Math.floor(s.minutes / 60)).padStart(2, "0")}:${String(s.minutes % 60).padStart(2, "0")}`;
    form.minutes.value = item.type === "homework" ? item.minutes : Math.max(5, Math.round((new Date(item.end) - new Date(item.start)) / 60000));
  } else {
    form.date.value = date;
    form.time.value = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    form.minutes.value = 60;
  }
  showFields();
  sheet.showModal();
  form.title.focus();
}

form.addEventListener("submit", async (e) => {
  if (e.submitter?.value !== "save") return; // Cancel
  e.preventDefault();
  if (!form.reportValidity()) return;
  const type = form.type.value;
  const [h, m] = form.time.value.split(":").map(Number);
  const startMin = h * 60 + m;
  const minutes = Math.max(5, Number(form.minutes.value) || 60);
  const startIso = localToIso(form.date.value, startMin, tz());
  const endIso = new Date(new Date(startIso).getTime() + minutes * 60000).toISOString();
  sheet.close();
  if (editing) {
    await change({ op: "update", id: editing.id, title: form.title.value, subject: form.subject.value, ...(type === "homework" ? { minutes } : {}) });
    const was = isoToLocal(editing.start, tz());
    if (was.date !== form.date.value || was.minutes !== startMin) await change({ op: "move", id: editing.id, start: startIso, ...(type === "class" ? { fromDay: weekdayOf(editing.date) } : {}) });
    return;
  }
  if (type === "homework") return change({ op: "add", type, title: form.title.value, subject: form.subject.value, due: startIso, minutes }, "Added.");
  if (type === "class") {
    const endMin = startMin + minutes;
    const hhmm = (x) => `${String(Math.floor(x / 60) % 24).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
    return change({ op: "add", type, title: form.title.value, days: form.days.value || DAY[weekdayOf(form.date.value)], start: hhmm(startMin), end: hhmm(endMin) }, "Added.");
  }
  return change({ op: "add", type, title: form.title.value, start: startIso, end: endIso }, "Added.");
});

$("pl-delete").addEventListener("click", () => {
  if (!editing) return;
  if (!confirm(`Delete ${editing.title}${editing.type === "class" ? " (every week)" : ""}?`)) return;
  sheet.close();
  change({ op: "delete", id: editing.id }, "Deleted.");
});

// ---- controls ------------------------------------------------------------------------------------
function shift(n) {
  const step = state.view === "day" ? 1 : state.view === "week" ? 7 : 0;
  if (step) state.date = addDays(state.date, n * step);
  else {
    const [y, m] = state.date.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1 + n, 1));
    state.date = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-01`;
  }
  load();
}
$("pl-prev").addEventListener("click", () => shift(-1));
$("pl-next").addEventListener("click", () => shift(1));
$("pl-today").addEventListener("click", () => {
  state.date = state.data?.today || "";
  delete $("pl-grid").dataset.scrolled;
  load();
});
document.querySelectorAll(".pl-views [data-view]").forEach((b) =>
  b.addEventListener("click", () => {
    state.view = b.dataset.view;
    try {
      localStorage.setItem(VIEW_KEY, state.view);
    } catch {
      /* private mode */
    }
    delete $("pl-grid").dataset.scrolled;
    load();
  }),
);
$("pl-plan").addEventListener("click", () => change({ op: "plan" }));
$("pl-accept").addEventListener("click", () => change({ op: "accept" }));
$("pl-reject").addEventListener("click", () => change({ op: "reject" }));

// ---- live updates: Jericho changed something by voice ---------------------------------------------
let reloadTimer = null;
function connectEvents() {
  const events = new EventSource(`/api/events?${new URLSearchParams({ token })}`);
  events.onmessage = (e) => {
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    if (msg.type !== "planner-changed" || msg.version === state.data?.version) return;
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(load, 150); // several changes in a row: one reload
  };
  events.onerror = () => {
    if (events.readyState === EventSource.CLOSED) setTimeout(connectEvents, 10_000);
  };
}
// the page in the background: refresh when it comes back (the "now" line and free time move)
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.data) load();
});

load();
connectEvents();
