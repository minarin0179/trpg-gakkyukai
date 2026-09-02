import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTag } from "@/lib/tags";
import { TAG_MAX_LENGTH } from "@/lib/config";

test("NFKC正規化と前後の空白除去", () => {
  // 全角英数・半角カナの揺れを吸収してタグを1つに寄せる
  assert.equal(normalizeTag("　ＴＲＰＧ　").tag, "TRPG");
  assert.equal(normalizeTag("  ｸﾄｩﾙﾌ  ").tag, "クトゥルフ");
});

test("空文字はエラー", () => {
  assert.ok(normalizeTag("   ").error);
  assert.equal(normalizeTag("   ").tag, undefined);
});

test("長さ上限は境界まで通す", () => {
  // 同一文字の連続は投稿フィルタ側((.)\1{11,})に掛かるので、長さだけを見るために文字を変える
  const max = "あいうえお".repeat(TAG_MAX_LENGTH / 5);
  assert.equal(max.length, TAG_MAX_LENGTH);
  assert.equal(normalizeTag(max).tag, max);
  assert.ok(normalizeTag(max + "か").error);
});

test("カンマ・改行と、投稿フィルタに触れる文字列はエラー", () => {
  assert.ok(normalizeTag("ホラー,SF").error);
  assert.ok(normalizeTag("ホラー\nSF").error);
  assert.ok(normalizeTag("example.com").error);
});
