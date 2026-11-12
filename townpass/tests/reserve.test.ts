import { test } from "node:test";
import assert from "node:assert/strict";
import { reserveLabel, reservePlatform, validateReserveUrl } from "../src/lib/reserve.ts";

test("detects booking platforms", () => {
  assert.equal(reservePlatform("https://resy.com/cities/montauk-ny/venues/x"), "Resy");
  assert.equal(reservePlatform("https://www.opentable.com/r/foo"), "OpenTable");
  assert.equal(reservePlatform("https://www.exploretock.com/bar"), "Tock");
  assert.equal(reservePlatform("https://www.sevenrooms.com/reservations/x"), "SevenRooms");
  assert.equal(reservePlatform("https://notresy.com/x"), null);
  assert.equal(reservePlatform("https://duryeas.com/reservations"), null);
  assert.equal(reserveLabel("https://resy.com/x"), "Reserve on Resy");
  assert.equal(reserveLabel("https://example.com/book"), "Reserve a table");
});

test("validates links", () => {
  assert.equal(validateReserveUrl(""), null);
  assert.equal(validateReserveUrl("https://resy.com/x"), null);
  assert.match(validateReserveUrl("http://resy.com/x")!, /https/);
  assert.match(validateReserveUrl("resy.com/x")!, /valid/);
});
