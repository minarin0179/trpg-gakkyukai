import test from "node:test";
import assert from "node:assert/strict";
import { findContentViolation } from "@/lib/content-filter";

// 方針(content-filter.ts)の要: TRPGの語彙は通し、構造で判定できるものだけ弾く。
// 「殺す」「死ぬ」「ロスト」等で誤爆しないことがこのフィルタの存在意義なので、
// 通す側もテストで固定しておく
test("TRPGの正当な語彙は通す", () => {
  for (const text of [
    "PCが死ぬ展開をGMが事前に伝えるべきだと思う",
    "キャラロストのあるシナリオは事前に告知してほしい",
    "セッション中に他のPLを殺す行為(PvP)は卓の合意が要る",
    "遅刻が続く人は次回の卓から外してよい",
    "1d100で決めるのは味気ない",
  ]) {
    assert.equal(findContentViolation(text), null, text);
  }
});

test("URL・ドメインは弾く", () => {
  assert.match(findContentViolation("詳細は https://example.com/a を見て") ?? "", /URL/);
  assert.match(findContentViolation("www.example.jp が参考になる") ?? "", /URL/);
  assert.match(findContentViolation("example.com に集合") ?? "", /URLやドメイン名/);
});

test("メールアドレス・電話番号・SNSアカウントは弾く", () => {
  // ドメイン判定に引っかからないTLDを使い、メール判定であることを確かめる
  assert.match(findContentViolation("連絡は foo@example.co まで") ?? "", /メールアドレス/);
  assert.match(findContentViolation("090-1234-5678 に連絡") ?? "", /電話番号/);
  assert.match(findContentViolation("@gamemaster に聞いて") ?? "", /SNSアカウント名/);
});

test("同一文字の過剰な繰り返しは弾く", () => {
  // 11回までは通し、12回から弾く((.)\1{11,})
  assert.equal(findContentViolation(`つ${"ら".repeat(10)}い`), null);
  assert.match(findContentViolation(`つ${"ら".repeat(12)}い`) ?? "", /繰り返し/);
});
