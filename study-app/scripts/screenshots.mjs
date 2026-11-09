// Visual QA: screenshots of every main screen on phone, iPad and laptop, in
// dark and light mode, plus side-by-side contact sheets for review.
//
// Needs: local Supabase running, `npm run build`, and the app started with
//   ALLOW_MOCK_AI=true npx next start -p 3100
// Usage: node scripts/screenshots.mjs <outDir> [screenFilter]
import { chromium, devices } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] ?? "screenshots";
const ONLY = process.argv[3];
const BASE = "http://localhost:3100";
mkdirSync(OUT, { recursive: true });

const status = JSON.parse(execSync("npx supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
const admin = createClient("http://127.0.0.1:54321", status.SERVICE_ROLE_KEY ?? status.SECRET_KEY, { auth: { persistSession: false } });

const DEVICES = {
  phone: { ...devices["iPhone 13"], deviceScaleFactor: 1 },
  ipad: { ...devices["iPad Pro 11"], deviceScaleFactor: 1 },
  laptop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};
const THEMES = ["dark", "light"];

const browser = await chromium.launch();

async function signIn(page, email) {
  await page.goto(`${BASE}/login`);
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill("password123");
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

async function notesPhoto(page) {
  const p = await page.context().newPage();
  await p.setViewportSize({ width: 900, height: 1150 });
  await p.setContent(`<body style="margin:0;background:#2e2c29;display:flex;align-items:center;justify-content:center;height:1150px">
    <div style="width:660px;height:900px;background:linear-gradient(100deg,#9c978a 0%,#f6f2e7 35%);transform:rotate(2.5deg);padding:48px 56px;font:30px 'Comic Sans MS',cursive;color:#1d2230;box-shadow:0 20px 60px rgba(0,0,0,.5)">
      <h2 style="margin:0 0 20px">Cell Biology</h2>
      <p>Mitochondria: makes ATP for the cell.</p><p>Ribosome: builds proteins.</p><p>Photosynthesis happens in the chloroplast.</p><p>DNA is stored in the nucleus.</p><p>Osmosis: water moves across a membrane.</p></div></body>`);
  const buf = await p.screenshot();
  await p.close();
  return buf;
}

// ---- Seed a realistic account -------------------------------------------
console.log("seeding…");
const email = `demo-${Date.now()}@example.com`;
const seedCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const seed = await seedCtx.newPage();
await signIn(seed, email);
const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
const uid = users.users.find((u) => u.email === email).id;
await admin.from("profiles").update({ display_name: "Maya Chen" }).eq("id", uid);
await admin.auth.admin.updateUserById(uid, { user_metadata: { full_name: "Maya Chen" } });
await seed.goto(`${BASE}/capture`);
const photo = await notesPhoto(seed);
await seed.getByTestId("file-input").setInputFiles([
  { name: "a.png", mimeType: "image/png", buffer: photo },
  { name: "b.png", mimeType: "image/png", buffer: photo },
]);
await seed.getByRole("img", { name: "Page 2" }).waitFor();
await seed.getByRole("combobox").first().selectOption("__new");
await seed.getByLabel("New class name").fill("AP Biology");
await seed.getByRole("button", { name: "Add", exact: true }).click();
await seed.waitForTimeout(400);
await seed.getByRole("button", { name: /Read 2 pages/ }).click();
await seed.waitForURL(/\/notes\//);
const noteUrl = new URL(seed.url()).pathname;
const noteId = noteUrl.split("/notes/")[1];
await seed.getByTestId("page-text").waitFor({ timeout: 30000 });
await seed.waitForTimeout(1500);
await seed.getByRole("button", { name: "Make quiz" }).click();
await seed.waitForURL(/\/quizzes\/[^/]+$/);
const quizUrl = new URL(seed.url()).pathname;
const quizId = quizUrl.split("/quizzes/")[1];
await admin.from("quiz_sets").update({ title: "Cell Biology: Organelles", visibility: "link" }).eq("id", quizId);
const { data: qs } = await admin.from("quiz_sets").select("share_code").eq("id", quizId).single();
// A second, older quiz so grids aren't lonely.
await seed.goto(BASE + noteUrl);
await seed.getByRole("button", { name: "Make quiz" }).click();
await seed.waitForURL(/\/quizzes\//);
const quiz2 = seed.url().split("/quizzes/")[1];
await admin.from("quiz_sets").update({ title: "Photosynthesis & Respiration" }).eq("id", quiz2);
// Restore the uncertain word on page 1 for the review screenshot.
const { data: pg } = await admin.from("note_pages").select("id, raw_text").eq("note_id", noteId).order("page_index");
// A note mid-read, for the scanning animation.
await seed.goto(`${BASE}/capture`);
await seed.getByTestId("file-input").setInputFiles([{ name: "c.png", mimeType: "image/png", buffer: photo }]);
await seed.getByRole("img", { name: "Page 1" }).waitFor();
await seed.getByRole("button", { name: /Read 1 page/ }).click();
await seed.waitForURL(/\/notes\//);
const readingId = seed.url().split("/notes/")[1];
await seed.waitForTimeout(2500);
await admin.from("note_pages").update({ status: "reading", raw_text: null }).eq("note_id", readingId);
await admin.from("notes").update({ status: "reading", title: "Genetics: Punnett squares" }).eq("id", readingId);
const state = await seedCtx.storageState();
await seedCtx.close();

// An empty account for empty states.
const emptyCtx = await browser.newContext();
const ep = await emptyCtx.newPage();
await signIn(ep, `empty-${Date.now()}@example.com`);
const emptyState = await emptyCtx.storageState();
await emptyCtx.close();
console.log("seeded", { noteUrl, quizUrl, share: qs.share_code });

// ---- Screens --------------------------------------------------------------
const SCREENS = [
  { name: "01-landing", auth: null, url: "/", full: true },
  { name: "02-login", auth: null, url: "/login" },
  { name: "03-home", auth: state, url: "/" },
  { name: "04-home-empty", auth: emptyState, url: "/" },
  { name: "05-capture-empty", auth: emptyState, url: "/capture" },
  {
    name: "06-capture-pages",
    auth: state,
    url: "/capture",
    run: async (page) => {
      await page.getByTestId("file-input").setInputFiles([
        { name: "a.png", mimeType: "image/png", buffer: photo },
        { name: "b.png", mimeType: "image/png", buffer: photo },
      ]);
      await page.getByRole("img", { name: "Page 2" }).waitFor();
    },
  },
  { name: "07-review", auth: state, url: noteUrl, run: async (p) => { await p.getByTestId("page-text").waitFor(); } },
  { name: "08-scanning", auth: state, url: `/notes/${readingId}`, wait: 1800 },
  { name: "09-quiz-editor", auth: state, url: quizUrl },
  { name: "10-share-sheet", auth: state, url: quizUrl, run: async (p) => { await p.getByRole("button", { name: "Share" }).click(); } },
  {
    name: "11-practice",
    auth: state,
    url: `${quizUrl}/play?mode=quiz`,
    run: async (p) => {
      await p.getByTestId("question-prompt").waitFor();
    },
  },
  {
    name: "12-practice-answered",
    auth: state,
    url: `${quizUrl}/play?mode=quiz`,
    run: async (p) => {
      for (let k = 0; k < 6; k++) {
        await p.getByTestId("question-prompt").waitFor();
        const show = p.getByRole("button", { name: "Show answer" });
        if (await show.isVisible()) {
          await show.click();
          await p.getByRole("button", { name: "Knew it" }).click();
          break;
        }
        const tf = p.getByRole("button", { name: "True", exact: true });
        const mc = p.locator("button:has(> span:text-is('A'))").first();
        if (await mc.isVisible()) { await mc.click(); await p.getByRole("button", { name: "Check" }).click(); break; }
        if (await tf.isVisible()) { await tf.click(); await p.getByRole("button", { name: "Check" }).click(); break; }
        if (await p.getByLabel("Your answer").isVisible()) { await p.getByLabel("Your answer").fill("mitochondria"); await p.getByRole("button", { name: "Check" }).click(); break; }
        await p.reload();
      }
    },
  },
  { name: "13-flashcards", auth: state, url: `${quizUrl}/play?mode=flashcards`, wait: 900 },
  { name: "14-flashcard-flipped", auth: state, url: `${quizUrl}/play?mode=flashcards`, run: async (p) => { await p.waitForTimeout(600); await p.getByTestId("flashcard").last().click(); await p.waitForTimeout(700); } },
  { name: "15-test-start", auth: state, url: `${quizUrl}/play?mode=test` },
  { name: "16-test-running", auth: state, url: `${quizUrl}/play?mode=test`, run: async (p) => { await p.getByRole("button", { name: "Start test" }).click(); await p.waitForTimeout(400); } },
  {
    name: "17-results",
    auth: state,
    url: `${quizUrl}/play?mode=flashcards`,
    run: async (p) => {
      for (let k = 0; k < 40; k++) {
        const b = p.getByRole("button", { name: "Got it" });
        if (!(await b.isVisible())) break;
        await b.click();
        await p.waitForTimeout(60);
      }
      await p.waitForTimeout(1600);
    },
  },
  { name: "18-library", auth: state, url: "/library" },
  { name: "19-library-empty", auth: emptyState, url: "/library" },
  { name: "20-ink", auth: state, url: "/ink", devices: ["ipad"] },
  { name: "21-shared", auth: null, url: `/q/${qs.share_code}`, full: true },
  { name: "22-shared-play", auth: null, url: `/q/${qs.share_code}/play?mode=quiz`, run: async (p) => { await p.getByTestId("question-prompt").waitFor(); } },
  { name: "23-shared-missing", auth: null, url: "/q/NOPE1234" },
];

for (const s of SCREENS) {
  if (ONLY && !s.name.includes(ONLY)) continue;
  for (const theme of THEMES) {
    for (const [dname, dev] of Object.entries(DEVICES)) {
      if (s.devices && !s.devices.includes(dname)) continue;
      const ctx = await browser.newContext({ ...dev, ...(s.auth ? { storageState: s.auth } : {}), reducedMotion: "no-preference" });
      await ctx.addInitScript((t) => localStorage.setItem("theme", t), theme);
      const page = await ctx.newPage();
      try {
        await page.goto(BASE + s.url, { waitUntil: "networkidle" });
        if (s.run) await s.run(page);
        if (s.full) {
          // Reveal scroll-triggered sections before a full-page shot.
          await page.evaluate(async () => {
            for (let y = 0; y < document.body.scrollHeight; y += 400) {
              window.scrollTo(0, y);
              await new Promise((r) => setTimeout(r, 60));
            }
            window.scrollTo(0, 0);
          });
        }
        await page.waitForTimeout(s.wait ?? 700);
        await page.screenshot({ path: `${OUT}/${s.name}--${dname}--${theme}.png`, fullPage: !!s.full && dname !== "laptop" ? false : !!s.full });
      } catch (e) {
        console.log("FAIL", s.name, dname, theme, String(e).split("\n")[0]);
      }
      await ctx.close();
    }
  }
  console.log("shot", s.name);
}

// OG images
const og = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await og.goto(`${BASE}/q/${qs.share_code}/opengraph-image`);
await og.screenshot({ path: `${OUT}/24-og-quiz.png` });
await og.goto(`${BASE}/opengraph-image`);
await og.screenshot({ path: `${OUT}/25-og-home.png` });

// Contact sheets: phone | iPad | laptop per screen and theme.
const sheet = await browser.newPage({ viewport: { width: 2400, height: 900 }, deviceScaleFactor: 0.6 });
const { readdirSync, readFileSync } = await import("node:fs");
const files = readdirSync(OUT).filter((f) => f.includes("--"));
const groups = {};
for (const f of files) {
  const [name, dev, themePng] = f.split("--");
  const key = `${name}--${themePng.replace(".png", "")}`;
  (groups[key] ??= {})[dev] = f;
}
mkdirSync(`${OUT}/sheets`, { recursive: true });
for (const [key, g] of Object.entries(groups)) {
  const img = (d) => (g[d] ? `<img src="data:image/png;base64,${readFileSync(`${OUT}/${g[d]}`).toString("base64")}" style="height:820px;border:1px solid #444;border-radius:8px">` : "");
  await sheet.setContent(`<body style="margin:0;padding:20px;background:#777;display:flex;gap:20px;align-items:flex-start;font:20px sans-serif">${img("phone")}${img("ipad")}${img("laptop")}</body>`);
  await sheet.screenshot({ path: `${OUT}/sheets/${key}.png`, fullPage: true });
}
await browser.close();
console.log("done");
