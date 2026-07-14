import test from "node:test";
import assert from "node:assert/strict";
import { subtests } from "../../lib/ist-data.ts";
import {
  ACCESS_CODE_ALPHABET,
  calculateExactAge,
  generateAccessCode,
  getDisplayRemainingSeconds,
  getFirstPendingSubtest,
  getNextSubtestCode,
  getRemainingSeconds,
  validateAccessCode,
} from "../../lib/ist-logic.ts";

test("calculateExactAge respects birthday boundary", () => {
  assert.equal(calculateExactAge("2000-05-14", "2026-05-13"), 25);
  assert.equal(calculateExactAge("2000-05-14", "2026-05-14"), 26);
});

test("getNextSubtestCode follows IST order", () => {
  assert.equal(getNextSubtestCode("SE"), "WA");
  assert.equal(getNextSubtestCode("ME"), null);
});

test("subtests match the nine IST groups and 176-item document range", () => {
  const groups = subtests.map(({ code, itemCount }) => ({ code, itemCount }));

  assert.deepEqual(groups, [
    { code: "SE", itemCount: 20 },
    { code: "WA", itemCount: 20 },
    { code: "AN", itemCount: 20 },
    { code: "GE", itemCount: 16 },
    { code: "RA", itemCount: 20 },
    { code: "ZR", itemCount: 20 },
    { code: "FA", itemCount: 20 },
    { code: "WU", itemCount: 20 },
    { code: "ME", itemCount: 20 },
  ]);
  assert.equal(
    subtests.reduce((total, subtest) => total + subtest.itemCount, 0),
    176,
  );
});

test("validateAccessCode returns next route for active demo code", () => {
  const result = validateAccessCode("IST-7K4M9Q2D");

  assert.equal(result.ok, true);
  assert.equal(result.status, "active");
  assert.equal(result.nextRoute, "/test/tutorial?code=IST-7K4M9Q2D&subtest=SE");
});

test("generateAccessCode uses IST prefix and unambiguous characters", () => {
  const code = generateAccessCode();

  assert.match(code, /^IST-[2-9A-HJKMNP-Z]{8}$/);

  for (const char of code.slice(4)) {
    assert.ok(ACCESS_CODE_ALPHABET.includes(char));
  }
});

test("generateAccessCode is deterministic with an injected random source", () => {
  const first = generateAccessCode(() => 0);
  const last = generateAccessCode(() => 0.999999);

  assert.equal(first, "IST-22222222");
  assert.equal(last, "IST-ZZZZZZZZ");
});

test("getFirstPendingSubtest locks completed subtests in fixed order", () => {
  assert.equal(getFirstPendingSubtest([]), "SE");
  assert.equal(getFirstPendingSubtest(["SE"]), "WA");
  assert.equal(getFirstPendingSubtest(["WA"]), "SE");
  assert.equal(
    getFirstPendingSubtest(["SE", "WA", "AN", "GE", "RA", "ZR", "FA", "WU", "ME"]),
    null,
  );
});

test("getRemainingSeconds derives display time from expires_at", () => {
  const now = Date.parse("2026-07-13T08:00:00.000Z");
  const expiresAt = Date.parse("2026-07-13T08:06:00.000Z");

  assert.equal(getRemainingSeconds(expiresAt, now), 360);
  assert.equal(getRemainingSeconds(expiresAt, expiresAt), 0);
  assert.equal(getRemainingSeconds(expiresAt, expiresAt + 5000), 0);
  assert.equal(getRemainingSeconds(expiresAt, expiresAt - 500), 1);
});

test("display timer never exceeds the configured subtest duration", () => {
  assert.equal(getDisplayRemainingSeconds(361_001, 6, 1_000), 360);
});

test("validateAccessCode rejects expired demo code", () => {
  const result = validateAccessCode("IST-EXPIRED1");

  assert.equal(result.ok, false);
  assert.equal(result.status, "expired");
  assert.equal(result.nextRoute, null);
});
