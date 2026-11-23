// The /memory page: shows data/memory.json and data/style.json, with delete buttons.
const $ = (id) => document.getElementById(id);
let token = "";
try { token = localStorage.getItem("jericho-token") || ""; } catch { /* private mode */ }

async function api(path, body) {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", "x-jericho-token": token },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) throw new Error("Access token missing. Open Jericho once with ?token=… first.");
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  return res.json();
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function itemRow(text, meta, onDelete) {
  const label = el("span", {}, text);
  if (meta) label.append(el("span", { className: "meta" }, meta));
  const del = el("button", { className: "del", type: "button", title: "Delete" }, "Delete");
  del.addEventListener("click", async () => {
    if (!confirm(`Delete this?\n\n${text}`)) return;
    del.disabled = true;
    try {
      await onDelete();
      await load();
    } catch (e) {
      $("status").textContent = e.message;
    }
  });
  return el("li", {}, label, del);
}

function emptyRow(text) {
  return el("li", {}, el("span", { className: "empty" }, text));
}

async function load() {
  try {
    const { memories, style, profile, lessons, categories } = await api("/api/memory");
    $("status").textContent = "";

    const lessonList = $("lessons");
    lessonList.replaceChildren();
    if (!lessons.length) lessonList.append(emptyRow("None yet. Correct Jericho when it gets something wrong (“no, I meant the office”) and it'll remember."));
    for (const l of [...lessons].reverse()) {
      lessonList.append(itemRow(l.text, `${l.date}${l.times > 1 ? ` · corrected ${l.times} times` : ""}`, () => api("/api/lessons/delete", { id: l.id })));
    }
    $("lessons-raw").textContent = JSON.stringify({ lessons }, null, 2);

    const box = $("profile");
    box.replaceChildren();
    const label = { projects: "Projects", goals: "Goals", people: "People", preferences: "Preferences", routines: "Routines", topics: "Topics you come back to" };
    for (const cat of categories) {
      const items = profile.items.filter((i) => i.category === cat);
      box.append(el("p", { className: "subhead" }, label[cat] || cat));
      const ul = el("ul", { className: "items" });
      if (!items.length) ul.append(emptyRow("Nothing yet."));
      for (const i of items) {
        const meta = `since ${i.firstSeen}${i.mentions > 1 ? ` · mentioned ${i.mentions} times` : ""}`;
        ul.append(itemRow(i.text, meta, () => api("/api/profile/delete", { id: i.id })));
      }
      box.append(ul);
    }
    box.append(el("p", { className: "subhead" }, "Recent conversations"));
    const recentUl = el("ul", { className: "items" });
    if (!profile.recent.length) recentUl.append(emptyRow("Nothing yet."));
    profile.recent.forEach((r, idx) => recentUl.append(itemRow(r.text, r.date, () => api("/api/profile/recent/delete", { index: idx }))));
    box.append(recentUl);
    $("profile-updated").textContent = profile.updatedAt ? `Last updated ${new Date(profile.updatedAt).toLocaleString()}.` : "";
    $("profile-raw").textContent = JSON.stringify(profile, null, 2);

    const list = $("memories");
    list.replaceChildren();
    if (!memories.length) list.append(emptyRow("Nothing yet. Try “Jericho, remember that I take my coffee black.”"));
    for (const m of [...memories].reverse()) {
      list.append(itemRow(m.text, `${m.topic} · ${m.date}`, () => api("/api/memory/delete", { id: m.id })));
    }
    $("memories-raw").textContent = JSON.stringify({ memories }, null, 2);

    const styleBox = $("style");
    styleBox.replaceChildren();
    const section = (title, rows) => {
      styleBox.append(el("p", { className: "subhead" }, title));
      const ul = el("ul", { className: "items" });
      if (!rows.length) ul.append(emptyRow("Nothing noted yet."));
      ul.append(...rows);
      styleBox.append(ul);
    };
    const del = (sectionName, index) => () => api("/api/style/delete", { section: sectionName, index });
    section("Phrases and slang", style.phrases.map((p, i) => itemRow(p, "", del("phrases", i))));
    section("Request length", style.requestLength ? [itemRow(style.requestLength, "", del("requestLength", 0))] : []);
    section("Reply preferences", style.replyPreferences.map((p, i) => itemRow(p, "", del("replyPreferences", i))));
    section(
      "Misheard words",
      style.mishearings.map((m, i) => itemRow(`“${m.heard}” → “${m.meant}”`, "", del("mishearings", i))),
    );
    $("style-updated").textContent = style.updatedAt ? `Last updated ${new Date(style.updatedAt).toLocaleString()}.` : "";
    $("style-raw").textContent = JSON.stringify(style, null, 2);
  } catch (e) {
    $("status").textContent = e.message;
  }
}

$("wipe").addEventListener("click", async () => {
  if (!confirm("Wipe all memories, lessons, your profile and the notes on how you talk? This can't be undone.")) return;
  try {
    await api("/api/memory/wipe", {});
    await load();
    $("status").textContent = "Everything wiped.";
  } catch (e) {
    $("status").textContent = e.message;
  }
});

load();
