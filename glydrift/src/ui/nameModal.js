// Neon username prompt (a DOM overlay so the phone's real keyboard works).
import { suggestUsername, validateUsername } from "../systems/username.js";

/**
 * @returns Promise<string|null> the chosen name, or null if cancelled
 */
export function askUsername({ initial = "", cancellable = false, title = "PICK A NAME" } = {}) {
  const modal = document.getElementById("name-modal");
  const form = modal.querySelector("form");
  const input = modal.querySelector("input");
  const err = modal.querySelector(".err");
  const save = modal.querySelector('[data-act="save"]');
  const cancel = modal.querySelector('[data-act="cancel"]');
  const random = modal.querySelector('[data-act="random"]');
  modal.querySelector("h2").textContent = title;
  cancel.style.display = cancellable ? "" : "none";
  input.value = initial || "";

  // keep taps/keys inside the modal away from the game underneath
  if (!modal.dataset.bound) {
    modal.dataset.bound = "1";
    for (const type of [
      "pointerdown",
      "pointerup",
      "mousedown",
      "mouseup",
      "touchstart",
      "touchend",
      "keydown",
      "keyup",
    ]) {
      modal.addEventListener(type, (e) => e.stopPropagation());
    }
  }

  const check = () => {
    const v = input.value.trim();
    const e = v.length === 0 ? "" : validateUsername(v);
    err.textContent = e || "";
    save.disabled = !!validateUsername(v);
  };

  return new Promise((resolve) => {
    const done = (value) => {
      modal.classList.remove("open");
      input.removeEventListener("input", onInput);
      form.removeEventListener("submit", onSubmit);
      cancel.removeEventListener("click", onCancel);
      random.removeEventListener("click", onRandom);
      input.blur();
      resolve(value);
    };
    const onInput = () => {
      // strip anything that isn't a letter/number as you type
      const cleaned = input.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 12);
      if (cleaned !== input.value) input.value = cleaned;
      check();
    };
    const onSubmit = (e) => {
      e.preventDefault();
      const v = input.value.trim();
      const bad = validateUsername(v);
      if (bad) {
        err.textContent = bad;
        return;
      }
      done(v);
    };
    const onCancel = () => done(null);
    const onRandom = () => {
      let n = suggestUsername();
      while (validateUsername(n)) n = suggestUsername();
      input.value = n;
      check();
    };
    input.addEventListener("input", onInput);
    form.addEventListener("submit", onSubmit);
    cancel.addEventListener("click", onCancel);
    random.addEventListener("click", onRandom);
    check();
    modal.classList.add("open");
    setTimeout(() => input.focus(), 50);
  });
}
