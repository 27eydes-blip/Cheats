// Two devices signed in to the same account at once (a phone and a tablet): neither one's
// progress is overwritten by the other's uploads, and coins earned or spent on each add up.
import { expect, test } from "@playwright/test";
import { openGame, profileOf } from "./helpers.js";

test("two devices at once: nothing bought on one is lost to the other, coins add up @smoke", async ({
  page,
}, testInfo) => {
  test.skip(!["iphone-std", "laptop"].includes(profileOf(testInfo)), "logic only: two sizes");
  const log = await openGame(page);
  const r = await page.evaluate(async () => {
    const { Account } = window.__glyAccount;
    const Save = window.__glySave;
    const calls = [];
    // the account's cloud copy (the other device, the tablet, writes it directly below)
    let cloud = {
      coins: 800,
      level: 3,
      unlocked: { volt: true },
      stats: { runs: 10 },
      syncId: "tablet-1",
    };
    Account.backend = {
      ...Account.backend,
      loadSave: async () => {
        calls.push("load");
        return JSON.parse(JSON.stringify(cloud));
      },
      storeSave: async (id, save) => {
        calls.push("store");
        cloud = JSON.parse(JSON.stringify(save));
      },
    };
    Account.user = { id: "u-two", email: "a@b.c", anon: false };
    Account.merged = false;
    Save.data.cloudSync = null;
    // this phone signs in: its save and the cloud's are merged once, then uploaded
    await Account.pushNow();
    const start = { phone: Save.data.coins, cloud: cloud.coins, id: cloud.syncId };

    // both play: the phone earns 120 coins ...
    Save.data.coins += 120;
    Save.write();
    // ... while the tablet buys EMBER for 300 coins and saves (it last synced the same copy)
    cloud = {
      ...cloud,
      coins: cloud.coins - 300,
      unlocked: { ...cloud.unlocked, ember: true },
      syncId: "tablet-2",
    };
    calls.length = 0;
    await Account.pushNow(); // the phone's next upload
    clearTimeout(Account.pushTimer);
    Account.pushTimer = null;
    const after = {
      calls: [...calls],
      phoneCoins: Save.data.coins,
      phoneEmber: !!Save.data.unlocked.ember,
      cloudCoins: cloud.coins,
      cloudEmber: !!cloud.unlocked?.ember,
      cloudId: cloud.syncId,
    };
    // another upload with no other device in between: nothing merged again, nothing doubled
    calls.length = 0;
    const merges = Account.mergedFromOther;
    await Account.pushNow();
    clearTimeout(Account.pushTimer);
    Account.pushTimer = null;
    const again = { calls: [...calls], merges: Account.mergedFromOther - merges, coins: cloud.coins };
    return { start, after, again };
  });
  // the first sync kept the most of both, and stamped the upload with this phone's id
  expect(r.start.cloud).toBe(r.start.phone);
  expect(r.start.id).not.toBe("tablet-1");
  // the tablet's purchase survives the phone's upload; the coins are both sides' changes
  expect(r.after.calls).toEqual(["load", "store"]);
  expect(r.after.cloudEmber, "the hero bought on the tablet is still in the cloud").toBe(true);
  expect(r.after.phoneEmber, "and now on the phone").toBe(true);
  expect(r.after.cloudCoins).toBe(r.start.phone + 120 - 300);
  expect(r.after.phoneCoins).toBe(r.after.cloudCoins);
  expect(r.after.cloudId).not.toBe("tablet-2");
  expect(r.again.merges).toBe(0);
  expect(r.again.coins).toBe(r.after.cloudCoins);
  expect(log.errors).toEqual([]);
});

test("cloud merge: coins changed on both sides since the last sync add up, never negative", async ({
  page,
}, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "logic only");
  const log = await openGame(page);
  const r = await page.evaluate(() => {
    const { mergeSaves } = window.__glyAccount;
    const synced = { coins: 1000, spins: 1, spinPts: 40 };
    const phone = { level: 9, coins: 1500, spins: 2, spinPts: 70, unlocked: { volt: true } };
    const tablet = { level: 2, coins: 400, spins: 3, spinPts: 40, unlocked: { volt: true, kai: true }, syncId: "t" };
    return {
      both: mergeSaves(phone, tablet, synced),
      spentAll: mergeSaves({ coins: 0, level: 1 }, { coins: 0, level: 1 }, { coins: 500 }),
      noBase: mergeSaves(phone, tablet),
    };
  });
  // +500 on the phone, -600 on the tablet; spins capped at 3; the tablet's hero kept
  expect(r.both.coins).toBe(900);
  expect(r.both.spins).toBe(3);
  expect(r.both.spinPts).toBe(70);
  expect(r.both.unlocked.kai).toBe(true);
  expect(r.both.syncId).toBeUndefined();
  expect(r.spentAll.coins).toBe(0);
  // no shared sync point (a device's first sync): the old rule, the most progress wins
  expect(r.noBase.coins).toBe(1500);
  expect(log.errors).toEqual([]);
});
