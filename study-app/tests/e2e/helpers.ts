import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";

export const SUPABASE_URL = "http://127.0.0.1:54321";

/** Service-role client for assertions only (never used by the app). */
export function admin() {
  const status = JSON.parse(execSync("npx supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  return createClient(SUPABASE_URL, status.SERVICE_ROLE_KEY ?? status.SECRET_KEY, { auth: { persistSession: false } });
}

export function newEmail() {
  return `student-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

export async function signIn(page: Page, email = newEmail(), password = "password123") {
  await page.goto("/login");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  return email;
}

/** A photo-like page of notes: off-white paper on a dark desk, with a shadow. */
export async function notesPhoto(page: Page): Promise<Buffer> {
  const p = await page.context().newPage();
  await p.setViewportSize({ width: 900, height: 1100 });
  await p.setContent(`
    <body style="margin:0;background:#3b3b3b;display:flex;align-items:center;justify-content:center;height:1100px">
      <div style="width:640px;height:860px;background:linear-gradient(90deg,#8d8a80 0%,#f4f1e8 40%);transform:rotate(3deg);padding:40px;font:28px 'Comic Sans MS',cursive;color:#222">
        <h2>Cell Biology</h2>
        <p>Mitochondria: makes ATP for the cell.</p>
        <p>Ribosome: builds proteins.</p>
        <p>DNA is stored in the nucleus.</p>
      </div>
    </body>`);
  const buf = await p.screenshot();
  await p.close();
  return buf;
}

export async function waitForQuestions(page: Page, min: number) {
  await expect
    .poll(async () => page.getByTestId("question-item").count(), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(min);
}
