// REPORT A NAME (leaderboard): pick a name from the board you're looking at. It's hidden for you
// straight away and reported (Leaderboard.reportName); BLOCK only hides that player for you
// (Leaderboard.blockPlayer). The support address is there too. A DOM overlay, styled like the
// account screen (#account-modal), so it scrolls and reads well on every phone.
import { HIDDEN_NAME, Leaderboard } from "../online/leaderboard.js";
import { SUPPORT_EMAIL } from "../systems/platform.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** rows: the board's rows; userId: yours (never listed). Resolves { changed } when it closes. */
export function openReport(rows, userId) {
  const modal = document.getElementById("account-modal");
  const card = modal.querySelector(".card");
  if (!modal.dataset.bound) {
    modal.dataset.bound = "1";
    for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "keydown", "keyup"])
      modal.addEventListener(type, (e) => e.stopPropagation());
  }
  const seen = new Set();
  const people = (rows || []).filter((r) => {
    if (!r?.player_id || r.player_id === userId || r.hiddenName || r.username === HIDDEN_NAME) return false;
    if (seen.has(r.player_id)) return false;
    seen.add(r.player_id);
    return true;
  });
  return new Promise((resolve) => {
    let changed = false;
    const close = () => {
      modal.classList.remove("open");
      card.innerHTML = "";
      resolve({ changed });
    };
    const render = (msg = "") => {
      const hiddenCount = Object.keys(Leaderboard.hidden).length;
      card.innerHTML = `
        <h2>REPORT A NAME</h2>
        <p>Tap a name that's offensive. It's hidden for you straight away and sent to us to remove.
        BLOCK just hides that player for you.</p>
        <div class="err ok">${esc(msg)}</div>
        <div class="stack report-list">
          ${
            people.length
              ? people
                  .map(
                    (r, i) =>
                      `<div class="report-row"><button type="button" class="alt" data-i="${i}">${esc(r.username || "?")}</button>` +
                      `<button type="button" class="alt block" data-block="${i}">BLOCK</button></div>`,
                  )
                  .join("")
              : `<p>No names to report on this board.</p>`
          }
        </div>
        <div class="stack">
          ${hiddenCount ? `<button type="button" class="link" data-act="unhide">Show ${hiddenCount} hidden name${hiddenCount > 1 ? "s" : ""} again</button>` : ""}
          <button type="button" data-act="close">DONE</button>
        </div>
        <p class="contact">Anything else? <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>`;
    };
    card.onclick = async (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.act === "close") return close();
      if (b.dataset.act === "unhide") {
        Leaderboard.unhideAll();
        changed = true;
        return render("Hidden names are shown again.");
      }
      if (b.dataset.block != null) {
        const r = people[Number(b.dataset.block)];
        people.splice(Number(b.dataset.block), 1);
        changed = true;
        Leaderboard.blockPlayer(r.player_id, r.username);
        return render(`Blocked. "${r.username}" is hidden now.`);
      }
      if (b.dataset.i != null) {
        const r = people[Number(b.dataset.i)];
        people.splice(Number(b.dataset.i), 1);
        changed = true;
        render(`Reported. "${r.username}" is hidden now.`);
        await Leaderboard.reportName(r.player_id, r.username);
      }
    };
    render();
    modal.classList.add("open");
  });
}
