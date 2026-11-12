import { test } from "node:test";
import assert from "node:assert/strict";
import { safeEqual, signToken, stickerSuffix, verifyToken } from "../src/lib/token.ts";

const SECRET = "test-secret-at-least-16-chars";

test("sign/verify roundtrip", async () => {
  const t = await signToken({ k: "access", p: "abc" }, SECRET);
  const p = await verifyToken<{ k: string; p: string }>(t, SECRET, "access");
  assert.equal(p?.p, "abc");
});

test("rejects tampering, wrong kind, wrong secret, expiry", async () => {
  const t = await signToken({ k: "access", p: "abc" }, SECRET);
  const [body, sig] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ k: "access", p: "xyz" })).toString("base64url");
  assert.equal(await verifyToken(`${forged}.${sig}`, SECRET, "access"), null);
  assert.equal(await verifyToken(`${body}.${sig}x`, SECRET, "access"), null);
  assert.equal(await verifyToken(t, SECRET, "admin"), null);
  assert.equal(await verifyToken(t, SECRET + "x", "access"), null);
  const old = await signToken({ k: "admin", exp: Date.now() - 1 }, SECRET);
  assert.equal(await verifyToken(old, SECRET, "admin"), null);
  assert.equal(await verifyToken("garbage", SECRET, "access"), null);
});

test("helpers", () => {
  assert.ok(safeEqual("abc", "abc"));
  assert.ok(!safeEqual("abc", "abd"));
  assert.ok(!safeEqual("abc", "abcd"));
  assert.match(stickerSuffix(), /^[2-9A-HJ-NP-Z]{6}$/);
});
