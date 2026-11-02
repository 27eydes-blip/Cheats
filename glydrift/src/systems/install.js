// "Add to Home Screen" helper.
//  - Android / desktop Chrome & Edge: captures `beforeinstallprompt` and shows the real
//    install dialog with one tap.
//  - iPhone / iPad (Safari has no install API): shows the Share → Add to Home Screen steps.
//  - Hidden entirely once the game is running from the home screen.

let deferred = null;
const listeners = new Set();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep it for our own button
    deferred = e;
    for (const fn of listeners) fn();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    for (const fn of listeners) fn();
  });
}

export const Install = {
  /** Running as an installed app (home screen icon)? */
  get standalone() {
    return (
      window.matchMedia?.("(display-mode: standalone)").matches ||
      window.matchMedia?.("(display-mode: fullscreen)").matches ||
      window.navigator.standalone === true
    );
  },

  get isIOS() {
    const ua = navigator.userAgent;
    return (
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
  },

  /** Worth offering the button? (not already installed) */
  get available() {
    return !this.standalone;
  },

  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Show the native prompt when the browser offers one, otherwise step-by-step help. */
  async prompt() {
    if (deferred) {
      const ev = deferred;
      deferred = null;
      ev.prompt();
      try {
        await ev.userChoice;
      } catch {
        /* dismissed */
      }
      return;
    }
    this.showHelp();
  },

  showHelp() {
    const modal = document.getElementById("install-modal");
    const ol = modal.querySelector("ol");
    const ua = navigator.userAgent;
    let steps;
    if (this.isIOS) {
      const notSafari = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
      steps = [
        notSafari
          ? "Open this page in <span class='glyph'>Safari</span> (best support on iPhone)"
          : null,
        "Tap the <span class='glyph'>Share</span> button (square with an ↑ arrow) in the toolbar",
        "Scroll down and tap <span class='glyph'>Add to Home Screen</span>",
        "Tap <span class='glyph'>Add</span> — Glydrift appears with its neon icon",
      ].filter(Boolean);
    } else if (/Android/.test(ua)) {
      steps = [
        "Tap the browser menu <span class='glyph'>⋮</span> (top right)",
        "Tap <span class='glyph'>Install app</span> or <span class='glyph'>Add to Home screen</span>",
        "Confirm — Glydrift appears with its neon icon",
      ];
    } else {
      steps = [
        "In Chrome or Edge, click the install icon <span class='glyph'>⊕</span> in the address bar",
        "Or open the browser menu and choose <span class='glyph'>Install Glydrift</span>",
        "On a phone: open this page and use Share / menu → Add to Home Screen",
      ];
    }
    ol.innerHTML = steps.map((s, i) => `<li><b>${i + 1}</b><span>${s}</span></li>`).join("");
    if (!modal.dataset.bound) {
      modal.dataset.bound = "1";
      for (const type of [
        "pointerdown",
        "pointerup",
        "mousedown",
        "mouseup",
        "touchstart",
        "touchend",
      ]) {
        modal.addEventListener(type, (e) => e.stopPropagation());
      }
      modal
        .querySelector('[data-act="close"]')
        .addEventListener("click", () => modal.classList.remove("open"));
    }
    modal.classList.add("open");
  },
};
