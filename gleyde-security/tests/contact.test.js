import assert from "node:assert/strict";
import { test } from "node:test";
import { validate } from "../functions/api/contact.js";

const good = { name: "Jane Doe", email: "Jane@Example.com", website: "example.com", message: "Please check my site.", consent: true };

test("accepts a valid submission and normalizes it", () => {
  const { data, fields } = validate(good);
  assert.deepEqual(fields, {});
  assert.equal(data.email, "jane@example.com");
  assert.equal(data.website, "https://example.com/");
});

test("rejects bad email, url, short message, missing consent", () => {
  const { fields } = validate({ name: "J", email: "nope", website: "javascript:alert(1)", message: "hi", consent: false });
  assert.deepEqual(Object.keys(fields).sort(), ["consent", "email", "message", "name", "website"]);
});

test("rejects header-injection attempts in email", () => {
  // Control characters are stripped first, so the leftover text fails the email pattern.
  assert.ok(validate({ ...good, email: "a@b.com\r\nBcc: x@y.com" }).fields.email);
  assert.ok(validate({ ...good, email: "a@b.com Bcc: x@y.com" }).fields.email);
});

test("strips control characters but keeps message newlines", () => {
  const { data } = validate({ ...good, name: "Ja\u0000ne‮", message: "line one\r\nline two\u0007" });
  assert.equal(data.name, "Jane");
  assert.equal(data.message, "line one\nline two");
});

test("enforces length limits", () => {
  assert.ok(validate({ ...good, message: "x".repeat(4001) }).fields.message);
  assert.ok(validate({ ...good, name: "x".repeat(101) }).fields.name);
  assert.ok(validate({ ...good, website: "https://user:pass@example.com" }).fields.website);
});
