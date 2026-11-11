// Yarema Landscaping — small helpers. No libraries needed.

// 1. Photo placeholders: if a photo file isn't in /images yet, remove the broken
//    image so the striped placeholder box (with its label) shows instead.
for (const img of document.querySelectorAll(".photo img")) {
  const showPlaceholder = () => img.remove();
  if (img.complete && img.naturalWidth === 0) {
    showPlaceholder();
  } else {
    img.addEventListener("error", showPlaceholder, { once: true });
  }
}

// 2. Quote form: send to Web3Forms without leaving the page, then show a thank-you.
const form = document.getElementById("quote-form");
const statusEl = document.getElementById("form-status");
const successEl = document.getElementById("form-success");
const CALL_US = "Please call or text (248) 251-7642 instead.";

if (form) {
  const button = form.querySelector('button[type="submit"]');
  const buttonLabel = button.textContent;

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
      field.toggleAttribute("aria-invalid", false);
    }
    if (invalid.length > 0) {
      for (const field of invalid) {
        field.setAttribute("aria-invalid", "true");
      }
      statusEl.textContent = "Please fill in your name, phone, address and the service you need.";
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
    button.textContent = "Sending…";

    try {
      const response = await fetch(form.action, {
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
      statusEl.textContent = `Sorry, that didn't send. ${CALL_US}`;
      button.disabled = false;
      button.textContent = buttonLabel;
    }
  });
}
