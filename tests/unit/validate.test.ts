import test from "node:test";
import assert from "node:assert/strict";
import { isThemeId, toIntId, isTargetType } from "@/lib/validate";

test("isThemeId は nanoid(12) だけ通す", () => {
  assert.equal(isThemeId("aB3_-xyz0123"), true);
  assert.equal(isThemeId("short"), false);
  assert.equal(isThemeId("aB3_-xyz01234"), false); // 13文字
  assert.equal(isThemeId("aB3_-xyz012!"), false); // 使えない文字
  assert.equal(isThemeId(123), false);
  assert.equal(isThemeId(null), false);
});

test("toIntId は正の整数(数値・数値文字列)だけ通す", () => {
  assert.equal(toIntId(5), 5);
  assert.equal(toIntId("5"), 5);
  assert.equal(toIntId(0), null);
  assert.equal(toIntId(-1), null);
  assert.equal(toIntId(1.5), null);
  assert.equal(toIntId("5a"), null);
  assert.equal(toIntId(""), null);
  assert.equal(toIntId(Number.MAX_SAFE_INTEGER + 2), null);
  assert.equal(toIntId(undefined), null);
});

test("isTargetType は通報の対象4種だけ通す", () => {
  for (const t of ["theme", "statement", "contact", "tag"]) {
    assert.equal(isTargetType(t), true);
  }
  assert.equal(isTargetType("vote"), false);
  assert.equal(isTargetType(null), false);
});
