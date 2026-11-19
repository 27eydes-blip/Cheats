// Deleting an account that signed in with Apple also revokes the Apple sign-in (App Store
// guideline 5.1.1(v); supabase/functions/apple-revoke). Against the stand-in server (?mockcloud):
//  - Apple confirms: the sign-in is revoked, then the account and its data are deleted
//  - the player closes Apple's sheet: nothing is deleted, and the screen says so
//  - Apple can't be reached (or the server function isn't set up yet): the account is still
//    deleted (a deletion must never get stuck)
//  - an email account: Apple is never asked
import { expect, test } from "@playwright/test";
import { openGame, profileOf, SAVE, waitFor } from "./helpers.js";

const EMAIL = "apple-player@example.com";

async function seed(page, { apple, mode }) {
  await page.addInitScript(
    ({ email, apple, mode }) => {
      if (sessionStorage.getItem("glyAppleSeeded")) return;
      sessionStorage.setItem("glyAppleSeeded", "1");
      localStorage.setItem(
        "glydrift.mockserver",
        JSON.stringify({
          users: { [email]: { id: "acct-apple", password: "x", save: null } },
          session: { id: "acct-apple", anon: false, email, apple },
          n: 1,
          appleRevoke: mode,
        }),
      );
    },
    { email: EMAIL, apple, mode },
  );
}
const server = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("glydrift.mockserver")));

async function deleteAccount(page) {
  await page.evaluate(() => {
    window.__glyOpenAccount();
  });
  await expect(page.locator("#account-modal.open")).toBeVisible();
  await page.click("#account-modal [data-act=to-delete]");
  const note = await page.locator("#account-modal .card").innerText();
  await page.fill("#account-modal input[name=confirm]", "DELETE");
  const reloaded = page.waitForEvent("load", { timeout: 15_000 }).catch(() => null);
  await page.click("#account-modal button[type=submit]");
  return { note, reloaded };
}

for (const [name, setup, expectCalls, expectGone] of [
  ["Apple confirms: revoked, then deleted", { apple: true, mode: "revoked" }, 1, true],
  ["Apple can't be reached: still deleted", { apple: true, mode: "fail" }, 1, true],
  ["an email account: Apple is never asked", { apple: false, mode: "revoked" }, 0, true],
]) {
  test(`delete account + Sign in with Apple: ${name} @smoke`, async ({ page }, testInfo) => {
    test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
    await seed(page, setup);
    const log = await openGame(page, { flags: ["mockcloud"], save: SAVE });
    await waitFor(page, () => window.__glyAccount?.Account?.signedIn === true, 20_000);
    const { note, reloaded } = await deleteAccount(page);
    expect(note.includes("Apple will ask you to confirm")).toBe(setup.apple);
    await reloaded;
    await waitFor(page, () => window.__glydrift?.scene.isActive("Menu"), 30_000);
    const db = await server(page);
    expect(db.appleCalls || 0).toBe(expectCalls);
    expect(!db.users[EMAIL]).toBe(expectGone);
    expect(log.errors).toEqual([]);
  });
}

test("delete account + Sign in with Apple: closing Apple's sheet keeps the account @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  await seed(page, { apple: true, mode: "cancelled" });
  const log = await openGame(page, { flags: ["mockcloud"], save: SAVE });
  await waitFor(page, () => window.__glyAccount?.Account?.signedIn === true, 20_000);
  await deleteAccount(page);
  await expect(page.locator("#account-modal .err")).toHaveText("Cancelled: your account wasn't deleted.");
  const db = await server(page);
  expect(db.appleCalls).toBe(1);
  expect(db.users[EMAIL]).toBeTruthy();
  expect(await page.evaluate(() => window.__glyAccount.Account.signedIn)).toBe(true);
  expect(log.errors).toEqual([]);
});
