// Yarema Landscaping — small helpers. No libraries needed.

const root = document.documentElement;
root.classList.add("js");

// 1. Photo placeholders: if a photo file isn't in /images yet, remove the broken
//    image so the striped placeholder (with its label) shows instead.
for (const img of document.querySelectorAll(".photo img")) {
  const showPlaceholder = () => {
    img.parentElement.classList.add("is-empty");
    img.remove();
  };
  if (img.complete && img.naturalWidth === 0) {
    showPlaceholder();
  } else {
    img.addEventListener("error", showPlaceholder, { once: true });
  }
}

// 2. Header: thin lime line once the page is scrolled.
const header = document.getElementById("site-header");
const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 8);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

// 3. Mobile menu: full-screen, closes on link tap or Escape.
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

// 4. Headlines slide up into view, once.
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

// 5. Quote form: send to Web3Forms without leaving the page, then confirm.
const form = document.getElementById("quote-form");
const statusEl = document.getElementById("form-status");
const successEl = document.getElementById("form-success");
const CALL_US = "Call or text (248) 251-7642 instead.";

if (form) {
  const button = form.querySelector('button[type="submit"]');
  const buttonLabel = button.querySelector(".btn-label");
  const buttonText = buttonLabel.textContent;

  form.addEventListener("input", (event) => {
    event.target.removeAttribute("aria-invalid");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    statusEl.textContent = "";

    // Check required fields and point the visitor at the first one that's missing.
    const required = [...form.querySelectorAll("[required]")];
    const invalid = required.filter((field) => !field.value.trim());
    for (const field of required) {
      field.removeAttribute("aria-invalid");
    }
    if (invalid.length > 0) {
      for (const field of invalid) {
        field.setAttribute("aria-invalid", "true");
      }
      statusEl.textContent = "Fill in your name, phone, address and the service you need.";
      invalid[0].focus();
      return;
    }

    const data = Object.fromEntries(new FormData(form));
    if (!data.access_key || data.access_key.startsWith("YOUR_")) {
      // The site owner hasn't added the Web3Forms key yet (see README.md).
      statusEl.textContent = `The quote form isn't connected yet. ${CALL_US}`;
      return;
    }

    button.disabled = true;
    buttonLabel.textContent = "Sending…";

    try {
      const response = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(data),
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
