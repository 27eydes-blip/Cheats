import { expect, test } from "@playwright/test";
import { admin, notesPhoto, signIn, waitForQuestions } from "./helpers";

test.describe("stage 1: capture → read → fix → quiz", () => {
  test("full flow on a laptop", async ({ page, browser }) => {
    const email = await signIn(page);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    // Capture: upload a photo, it gets cleaned.
    await page.goto("/capture");
    await page.getByTestId("file-input").setInputFiles({ name: "notes.png", mimeType: "image/png", buffer: await notesPhoto(page) });
    await expect(page.getByAltText("Page 1")).toBeVisible();
    await page.getByRole("button", { name: "Show original" }).click();
    await page.getByRole("button", { name: "Show cleaned" }).click();

    // New class inline, so the AI gets subject context.
    await page.getByRole("combobox").first().selectOption("__new");
    await page.getByLabel("New class name").fill("Biology");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("combobox").first()).toHaveValue(/[0-9a-f-]{36}/);
    await page.getByRole("button", { name: /Read 1 page/ }).click();

    // Review: side by side, uncertain word highlighted.
    await page.waitForURL(/\/notes\//);
    const noteId = page.url().split("/notes/")[1];
    await expect(page.getByTestId("page-text")).toContainText("powerhouse of the cell", { timeout: 30_000 });
    await expect(page.getByRole("img", { name: "Page 1" })).toBeVisible();
    await expect(page.getByText("1 word to check")).toBeVisible();

    // Fix it with an alternative; the correction is saved to learn handwriting.
    await page.locator("[data-uncertain]").first().click();
    await page.getByRole("dialog", { name: "Fix word" }).getByRole("button", { name: "mitochondrion" }).click();
    await expect(page.getByText("All words checked")).toBeVisible();
    const db = admin();
    await expect
      .poll(async () => (await db.from("handwriting_corrections").select("original, corrected").eq("note_page_id", (await db.from("note_pages").select("id").eq("note_id", noteId).single()).data!.id)).data)
      .toEqual([{ original: "mitochondria", corrected: "mitochondrion" }]);
    const page0 = await db.from("note_pages").select("text, raw_text").eq("note_id", noteId).single();
    expect(page0.data!.text).toContain("The mitochondrion is the powerhouse");
    expect(page0.data!.raw_text).not.toContain("[[");

    // Free-form edit also teaches the profile.
    await page.getByRole("button", { name: "Edit text" }).click();
    const box = page.getByLabel("Edit text");
    await box.fill((await box.inputValue()).replace("Ribosome", "Ribosomes"));
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(/Learned 1 fix/)).toBeVisible();

    // Mark a focus passage by selecting text.
    await page.getByTestId("page-text").evaluate((el) => {
      const range = document.createRange();
      const node = [...el.querySelectorAll("span")].find((s) => s.textContent?.includes("Osmosis"))!.firstChild!;
      const start = node.textContent!.indexOf("Osmosis");
      range.setStart(node, start);
      range.setEnd(node, start + "Osmosis is the movement of water".length);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
      el.parentElement!.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    await page.getByRole("button", { name: /Quiz me harder on this/ }).click();
    await expect(page.getByText("Quizzed harder", { exact: true })).toBeVisible();

    // Generate a quiz.
    await page.getByRole("button", { name: "Make quiz" }).click();
    await page.waitForURL(/\/quizzes\//);
    const quizUrl = page.url();
    await waitForQuestions(page, 10);

    // Every question links to its source in the notes.
    const first = page.getByTestId("question-item").first();
    await first.getByRole("button", { name: "Source" }).click();
    await expect(first.getByTestId("source-preview").locator("mark")).toBeVisible();

    // Cross-device sync: a second session (e.g. the iPad) sees edits live.
    const ipad = await browser.newContext({ storageState: await page.context().storageState() });
    const other = await ipad.newPage();
    await other.goto(quizUrl);
    await expect(other.getByTestId("question-item")).toHaveCount(await page.getByTestId("question-item").count());
    const before = await page.getByTestId("question-item").count();
    await page.getByTestId("question-item").last().getByRole("button", { name: "Delete question" }).click();
    await expect(page.getByTestId("question-item")).toHaveCount(before - 1);
    await expect(other.getByTestId("question-item")).toHaveCount(before - 1);
    await ipad.close();

    // Edit a question.
    const item = page.getByTestId("question-item").first();
    await item.getByRole("button", { name: "Edit" }).click();
    await item.getByRole("button", { name: "Save" }).click();
    await expect(item.getByText("Edited")).toBeVisible();

    // Regenerate a question as a different type.
    const target = page.getByTestId("question-item").nth(1);
    await target.getByRole("button", { name: "Regenerate" }).click();
    await target.getByRole("button", { name: "True or false" }).click();
    await expect(page.getByText("New question ready")).toBeVisible();
    await expect(page.getByTestId("question-item").nth(1).locator("span", { hasText: /^True or false$/ })).toBeVisible();

    // Practice: answer and get feedback.
    await page.getByRole("link", { name: /^Practice Instant feedback/ }).click();
    await expect(page.getByTestId("question-prompt")).toBeVisible();
    const show = page.getByRole("button", { name: "Show answer" });
    const mcChoice = page.locator("button:has(> span:text-is('A'))").first();
    const trueBtn = page.getByRole("button", { name: "True", exact: true });
    const textBox = page.getByLabel("Your answer");
    if (await show.isVisible()) {
      await show.click();
      await page.getByRole("button", { name: "Knew it" }).click();
    } else {
      if (await mcChoice.isVisible()) await mcChoice.click();
      else if (await trueBtn.isVisible()) await trueBtn.click();
      else if (await textBox.isVisible()) await textBox.fill("mitochondria");
      else {
        // Matching: tap a term, then a match.
        await page.getByText("Tap a term, then tap its match.").waitFor();
        const grid = page.locator(".grid-cols-2").first();
        await grid.locator("> div").first().locator("button").first().click();
        await grid.locator("> div").nth(1).locator("button").first().click();
      }
      await page.getByRole("button", { name: "Check" }).click();
    }
    await expect(page.getByRole("button", { name: /Next|See results/ })).toBeVisible();

    // Flashcards.
    await page.goto(`${quizUrl}/play?mode=flashcards`);
    await page.getByTestId("flashcard").last().click(); // top of the stack
    await page.getByRole("button", { name: "Got it" }).click();
    await expect(page.getByText(/^1 of \d+ known/)).toBeVisible();

    // Timed practice test.
    await page.goto(`${quizUrl}/play?mode=test`);
    await page.getByRole("button", { name: "Start test" }).click();
    await expect(page.getByText(/\d+:\d\d/)).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText(/Score: \d+%/)).toBeVisible();

    expect(email).toContain("@");
  });

  test("students can't see each other's notes", async ({ page, browser }) => {
    await signIn(page);
    await page.goto("/capture");
    await page.getByTestId("file-input").setInputFiles({ name: "notes.png", mimeType: "image/png", buffer: await notesPhoto(page) });
    await page.getByRole("button", { name: /Read 1 page/ }).click();
    await page.waitForURL(/\/notes\//);
    const url = page.url();

    const ctx = await browser.newContext();
    const intruder = await ctx.newPage();
    await signIn(intruder);
    await intruder.goto(url);
    await expect(intruder.getByText("Notes not found")).toBeVisible();
    // The read API refuses too.
    const res = await intruder.request.post(`${url.replace("/notes/", "/api/notes/")}/pages/0/read`);
    expect(res.status()).toBe(404);
    await ctx.close();
  });

  test("friends can open a shared quiz without an account", async ({ page, browser }) => {
    await signIn(page);
    await page.goto("/capture");
    await page.getByTestId("file-input").setInputFiles({ name: "notes.png", mimeType: "image/png", buffer: await notesPhoto(page) });
    await page.getByRole("button", { name: /Read 1 page/ }).click();
    await page.waitForURL(/\/notes\//);
    await page.getByTestId("page-text").waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: "Make quiz" }).click();
    await page.waitForURL(/\/quizzes\//);
    await waitForQuestions(page, 5);

    await page.getByRole("button", { name: "Share" }).click();
    const dialog = page.getByRole("dialog", { name: "Share quiz" });
    const code = (await dialog.locator(".font-mono.text-2xl").textContent())!.trim();

    const guestCtx = await browser.newContext();
    const guest = await guestCtx.newPage();
    // Not shared yet: private.
    await guest.goto(`/q/${code}`);
    await expect(guest.getByText("This quiz isn't available")).toBeVisible();

    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await dialog.getByRole("button", { name: "Copy link" }).click();
    await expect(page.getByText(/Link copied/)).toBeVisible();

    // Shared: anyone with the link can see and play it, right away.
    await guest.goto(`/q/${code}`);
    await expect(guest.getByRole("link", { name: /Start quiz/ })).toBeVisible();
    await guest.getByRole("link", { name: /Start quiz/ }).click();
    await expect(guest.getByTestId("question-prompt")).toBeVisible();
    // Link preview image renders.
    const og = await guest.request.get(`/q/${code}/opengraph-image`);
    expect(og.status()).toBe(200);
    expect(og.headers()["content-type"]).toContain("image/png");
    await guestCtx.close();
  });

  test("API rejects signed-out requests", async ({ request }) => {
    const res = await request.post("/api/notes/00000000-0000-0000-0000-000000000000/quiz", { data: {} });
    expect(res.status()).toBe(401);
  });
});
