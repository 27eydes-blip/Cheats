// Yarema Landscaping — site behavior. Plain JavaScript, no libraries.

const root = document.documentElement;
root.classList.add("js");

// ---------- 1. Photos ----------
// If a photo file isn't in /images yet, drop the broken image so the striped
// stand-in shows, labeled with the file name to add.
const markEmpty = (img) => {
  img.parentElement.classList.add("is-empty");
  img.remove();
};

for (const img of document.querySelectorAll(".photo img")) {
  if (img.complete && img.naturalWidth === 0) {
    markEmpty(img);
  } else if (!img.complete) {
    img.addEventListener("error", () => markEmpty(img), { once: true });
  }
}

// Swap the photo inside a .photo box (used by the before/after tabs and the viewer).
const setPhoto = (box, src, alt) => {
  box.querySelector("img")?.remove();
  box.classList.remove("is-empty");
  box.dataset.label = src;
  const img = new Image();
  img.alt = alt;
  img.addEventListener("error", () => markEmpty(img), { once: true });
  box.prepend(img);
  img.src = src;
};

// ---------- 2. Header: lime line once the page is scrolled ----------
const header = document.getElementById("site-header");
const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 8);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

// ---------- 3. Mobile menu ----------
const menuToggle = document.getElementById("menu-toggle");
const nav = document.getElementById("site-nav");
const setMenu = (open) => {
  root.classList.toggle("nav-open", open);
  menuToggle.setAttribute("aria-expanded", String(open));
  document.body.style.overflow = open ? "hidden" : "";
};
menuToggle.addEventListener("click", () => setMenu(!root.classList.contains("nav-open")));
nav.addEventListener("click", (event) => {
  if (event.target.closest("a")) setMenu(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && root.classList.contains("nav-open")) {
    setMenu(false);
    menuToggle.focus();
  }
});
window.matchMedia("(width > 900px)").addEventListener("change", () => setMenu(false));

// ---------- 4. Headlines slide up into view, once ----------
const reveals = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          observer.unobserve(entry.target);
        }
      }
    },
    { rootMargin: "0px 0px -8% 0px" },
  );
  for (const el of reveals) observer.observe(el);
} else {
  for (const el of reveals) el.classList.add("in");
}

// ---------- 5. Before / after slider ----------
const stage = document.getElementById("ba-stage");
const range = document.getElementById("ba-range");
const tabs = [...document.querySelectorAll(".ba-tab")];

const setPosition = () => stage.style.setProperty("--pos", `${range.value}%`);
range.addEventListener("input", setPosition);
setPosition();

const selectTab = (tab) => {
  for (const other of tabs) {
    const selected = other === tab;
    other.setAttribute("aria-selected", String(selected));
    other.tabIndex = selected ? 0 : -1;
  }
  const n = tab.dataset.n;
  setPhoto(
    stage.querySelector(".ba-after"),
    `images/after-${n}.webp`,
    "The property after Yarema Landscaping finished",
  );
  setPhoto(
    stage.querySelector(".ba-before"),
    `images/before-${n}.webp`,
    "The same property before work began",
  );
  range.value = 50;
  setPosition();
};

for (const tab of tabs) {
  tab.addEventListener("click", () => selectTab(tab));
  tab.addEventListener("keydown", (event) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = tabs[(tabs.indexOf(tab) + step + tabs.length) % tabs.length];
    next.focus();
    selectTab(next);
  });
}

// ---------- 6. Gallery viewer ----------
const lightbox = document.getElementById("lightbox");
const shots = [...document.querySelectorAll(".shot")];
const lbPhoto = document.getElementById("lb-photo");
const lbCount = document.getElementById("lb-count");
const lbCap = document.getElementById("lb-cap");
const pad = (n) => String(n).padStart(2, "0");
let current = 0;

// Remember each photo's file and description up front (missing images get removed above).
const shotData = shots.map((shot) => ({
  src: shot.querySelector(".photo").dataset.label,
  alt: shot.querySelector("img")?.alt ?? "",
  caption: shot.querySelector(".shot-cap").textContent,
}));

const showShot = (index) => {
  current = (index + shots.length) % shots.length;
  const { src, alt, caption } = shotData[current];
  setPhoto(lbPhoto, src, alt);
  lbCount.textContent = `${pad(current + 1)} / ${pad(shots.length)}`;
  lbCap.textContent = caption;
};

if (typeof lightbox.showModal === "function") {
  shots.forEach((shot, index) => {
    shot.addEventListener("click", () => {
      showShot(index);
      lightbox.showModal();
    });
  });
  lightbox.querySelector(".lb-close").addEventListener("click", () => lightbox.close());
  lightbox.querySelector(".lb-prev").addEventListener("click", () => showShot(current - 1));
  lightbox.querySelector(".lb-next").addEventListener("click", () => showShot(current + 1));
  lightbox.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") showShot(current - 1);
    if (event.key === "ArrowRight") showShot(current + 1);
  });
  // Esc closes it (built into <dialog>); so does a click outside the photo.
  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) lightbox.close();
  });
  lightbox.addEventListener("close", () => shots[current].focus());
}

// ---------- 7. Quote form ----------
const form = document.getElementById("quote-form");
const statusEl = document.getElementById("form-status");
const successEl = document.getElementById("form-success");
const serviceSelect = document.getElementById("q-service");
const CALL_US = "Call or text (248) 251-7642 instead.";

// "Get a quote" links on service cards pre-select that service.
for (const link of document.querySelectorAll("[data-service]")) {
  link.addEventListener("click", () => {
    const wanted = link.dataset.service;
    const option = [...serviceSelect.options].find((o) => o.text === wanted);
    if (option) {
      serviceSelect.value = option.value;
      showError(serviceSelect, "");
    }
  });
}

// One rule per field: return a message when the value is not acceptable.
const rules = {
  "q-name": (v) => (v ? "" : "Enter your name."),
  "q-phone": (v) =>
    v.replace(/\D/g, "").length >= 10 ? "" : "Enter a 10-digit phone number so we can reach you.",
  "q-email": (v) =>
    !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
      ? ""
      : "That email doesn't look right. Fix it or leave it blank.",
  "q-address": (v) => (v ? "" : "Enter the property address."),
  "q-service": (v) => (v ? "" : "Choose a service."),
};

function showError(field, message) {
  const errorEl = document.getElementById(`${field.id}-err`);
  if (errorEl) errorEl.textContent = message;
  if (message) {
    field.setAttribute("aria-invalid", "true");
  } else {
    field.removeAttribute("aria-invalid");
  }
}

const validate = (field) => {
  const message = rules[field.id](field.value.trim());
  showError(field, message);
  return !message;
};

if (form) {
  const button = form.querySelector('button[type="submit"]');
  const buttonLabel = button.querySelector(".btn-label");
  const buttonText = buttonLabel.textContent;
  const fields = Object.keys(rules).map((id) => document.getElementById(id));

  for (const field of fields) {
    // Check a field when the visitor leaves it; clear the message as they fix it.
    field.addEventListener("blur", () => {
      if (field.value.trim() || field.hasAttribute("aria-invalid")) validate(field);
    });
    field.addEventListener("input", () => {
      if (field.hasAttribute("aria-invalid")) validate(field);
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    statusEl.textContent = "";

    const invalid = fields.filter((field) => !validate(field));
    if (invalid.length > 0) {
      invalid[0].focus();
      return;
    }

    const formData = new FormData(form);
    const key = formData.get("access_key");
    if (!key || key.startsWith("YOUR_")) {
      // The site owner hasn't added the Web3Forms key yet (see README.md).
      statusEl.textContent = `The quote form isn't connected yet. ${CALL_US}`;
      return;
    }

    // Send the photo only when the upload field is switched on and a file was chosen.
    const photoField = document.getElementById("photo-field");
    const photo = formData.get("attachment");
    const hasPhoto = !photoField.hidden && photo instanceof File && photo.size > 0;
    if (!hasPhoto) formData.delete("attachment");

    button.disabled = true;
    buttonLabel.textContent = "Sending…";

    try {
      const response = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: hasPhoto
          ? { Accept: "application/json" }
          : { "Content-Type": "application/json", Accept: "application/json" },
        body: hasPhoto ? formData : JSON.stringify(Object.fromEntries(formData)),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Submission failed");
      }
      form.hidden = true;
      successEl.hidden = false;
      successEl.focus();
    } catch (error) {
      console.error(error);
      statusEl.textContent = `That didn't send. ${CALL_US}`;
      button.disabled = false;
      buttonLabel.textContent = buttonText;
    }
  });
}
