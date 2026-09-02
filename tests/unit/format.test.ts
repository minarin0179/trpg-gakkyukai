import test from "node:test";
import assert from "node:assert/strict";
import { formatRelativeDate } from "@/lib/format";

// formatRelativeDate は内部で Date.now() を見る(nowを注入できない)ため、
// 現在時刻からの相対でDateを組み立てて境界を確かめる。
// 判定は経過ミリ秒ベースなので、実行時刻に関係なく結果は決まる
const DAY = 86_400_000;
const ago = (ms: number) => new Date(Date.now() - ms);

test("1週間未満は日数表示", () => {
  assert.equal(formatRelativeDate(ago(0)), "今日");
  assert.equal(formatRelativeDate(ago(DAY + 1000)), "昨日");
  assert.equal(formatRelativeDate(ago(3 * DAY + 1000)), "3日前");
  assert.equal(formatRelativeDate(ago(6 * DAY + 1000)), "6日前");
});

test("1週間以上1か月未満は週表示", () => {
  assert.equal(formatRelativeDate(ago(7 * DAY + 1000)), "1週間前");
  assert.equal(formatRelativeDate(ago(29 * DAY + 1000)), "4週間前");
});

test("30日以上は絶対日付", () => {
  const d = ago(30 * DAY + 1000);
  assert.equal(
    formatRelativeDate(d),
    new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).format(d),
  );
});

test("未来の日付は「今日」", () => {
  assert.equal(formatRelativeDate(new Date(Date.now() + DAY)), "今日");
});
