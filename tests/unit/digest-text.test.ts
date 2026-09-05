import test from "node:test";
import assert from "node:assert/strict";
import {
  DIGEST_THEME_LIMIT,
  X_MAX_UNITS,
  composeDigestText,
  weekEndKey,
  formatWeekRange,
  isoWeekKey,
  parseWeekKey,
  previousWeekStart,
  startOfWeekJst,
  truncateToUnits,
  weekStartFromKey,
  weekStartKey,
  xLength,
  type WeeklyPost,
} from "@/lib/digest-text";

// 週の区切りは日本時間の月曜0:00(=前日15:00 UTC)。実行環境のタイムゾーンに
// 依存しないことを、UTCの時刻を直接与えて確かめる
test("週の開始は日本時間の月曜0:00", () => {
  const inWeek = startOfWeekJst(new Date("2026-09-05T00:00:00Z"));
  assert.equal(inWeek.toISOString(), "2026-08-30T15:00:00.000Z");
  assert.equal(weekStartKey(inWeek), "2026-08-31");

  // 月曜0:00 JST ちょうどは新しい週、その1秒前は前の週
  assert.equal(weekStartKey(startOfWeekJst(new Date("2026-09-06T15:00:00Z"))), "2026-09-07");
  assert.equal(weekStartKey(startOfWeekJst(new Date("2026-09-06T14:59:59Z"))), "2026-08-31");
});

test("ISO週番号は木曜が属する年で決まる", () => {
  assert.equal(isoWeekKey(startOfWeekJst(new Date("2026-09-05T00:00:00Z"))), "2026-W36");
  // 2026-01-01(木)を含む週は2026年の第1週。開始は前年の12/29(月)
  const newYearWeek = startOfWeekJst(new Date("2026-01-01T00:00:00Z"));
  assert.equal(weekStartKey(newYearWeek), "2025-12-29");
  assert.equal(isoWeekKey(newYearWeek), "2026-W01");
});

test("週キーの解釈は往復して一致する", () => {
  const weekStart = parseWeekKey("2026-W36");
  assert.ok(weekStart);
  assert.equal(weekStartKey(weekStart), "2026-08-31");
  assert.equal(isoWeekKey(weekStart), "2026-W36");
  // 2026年は53週まである年
  assert.ok(parseWeekKey("2026-W53"));
  // 第53週が無い年・形式違いは無効
  assert.equal(parseWeekKey("2025-W53"), null);
  assert.equal(parseWeekKey("2026-W00"), null);
  assert.equal(parseWeekKey("2026-36"), null);
});

test("週の日付から実時刻に戻せる", () => {
  assert.equal(weekStartFromKey("2026-08-31").toISOString(), "2026-08-30T15:00:00.000Z");
  assert.equal(formatWeekRange(weekStartFromKey("2026-08-31")), "8/31〜9/6");
});

test("週の終わりは同じ週の日曜(閉区間)", () => {
  assert.equal(weekEndKey(weekStartFromKey("2026-08-31")), "2026-09-06");
});

test("cronは直前に終わった週を対象にする", () => {
  // 月曜11:00 UTC(=20:00 JST)に走るcronの時刻
  const weekStart = previousWeekStart(new Date("2026-09-07T11:00:00Z"));
  assert.equal(weekStartKey(weekStart), "2026-08-31");
});

test("xLength は全角2・半角1で数え、URLは23文字扱い", () => {
  assert.equal(xLength("abc"), 3);
  assert.equal(xLength("あいう"), 6);
  assert.equal(xLength("a あ"), 4); // 半角1 + 空白1 + 全角2
  // URLは長さに関係なく23。短いURLでも23で数える(t.coの短縮に合わせる)
  assert.equal(xLength("https://a.example"), 23);
  assert.equal(xLength("https://trpg-gakkyukai.com/themes?tab=active"), 23);
  assert.equal(xLength("今週 https://trpg-gakkyukai.com/themes?tab=active"), 4 + 1 + 23);
  // 上限280は全角140字ぶん
  assert.equal(xLength("あ".repeat(140)), X_MAX_UNITS);
});

test("truncateToUnits は単位数で切って「…」を付ける", () => {
  assert.equal(truncateToUnits("あいうえお", 10), "あいうえお");
  assert.equal(truncateToUnits("あいうえお", 8), "あいう…");
  // 「…」自体が全角(2単位)なので、上限4なら本文に使えるのは2単位
  assert.equal(truncateToUnits("abcdef", 4), "ab…");
  assert.equal(truncateToUnits("あいうえお", 1), "");
});

const URL = "https://trpg-gakkyukai.com/themes?tab=active";

function postOf(titles: string[]): WeeklyPost {
  return {
    weekStart: "2026-08-31",
    weekEnd: "2026-09-06",
    themes: titles.map((title, i) => ({ id: `theme${i}`, title, weekVoters: 10 - i })),
  };
}

test("投稿は見出し2行・テーマのタイトル・URLで構成される", () => {
  const text = composeDigestText(postOf(["遅刻の扱い", "キャラシの提出期限"]), URL);
  assert.equal(
    text,
    [
      "今週のTRPG学級会(8/31〜9/6)",
      "投票が多かったテーマ",
      "「遅刻の扱い」",
      "「キャラシの提出期限」",
      URL,
    ].join("\n"),
  );
  assert.ok(xLength(text) <= X_MAX_UNITS);
});

test("載せるタイトルは5件まで", () => {
  const titles = ["あ", "い", "う", "え", "お", "か"].map((c) => `テーマ${c}`);
  const lines = composeDigestText(postOf(titles), URL).split("\n");
  // 見出し2行 + タイトル5行 + URL
  assert.equal(lines.length, 2 + DIGEST_THEME_LIMIT + 1);
  assert.equal(lines[2], "「テーマあ」");
  assert.equal(lines[6], "「テーマお」");
  assert.equal(lines.at(-1), URL);
});

test("長いタイトルは全角24字で切り詰め、上限を超える行は落とす", () => {
  const long = "あ".repeat(100);
  const text = composeDigestText(postOf(Array(5).fill(long)), URL);
  const lines = text.split("\n");
  // 「…」を含めて全角24字(=48単位)。「」を足して52単位の行になる
  assert.equal(lines[2], `「${"あ".repeat(23)}…」`);
  assert.equal(xLength(lines[2]!), 52);
  // 枠に入らない行は落とすので、5件すべては載らない
  assert.ok(lines.length < 2 + 5 + 1);
  assert.ok(xLength(text) <= X_MAX_UNITS, `over limit: ${xLength(text)}`);
  assert.ok(text.endsWith(URL));
});

test("該当するテーマが無い週も見出しとURLは出す", () => {
  assert.equal(
    composeDigestText(postOf([]), URL),
    [
      "今週のTRPG学級会(8/31〜9/6)",
      "投票が多かったテーマ",
      "今週は投票の多いテーマがありませんでした。",
      URL,
    ].join("\n"),
  );
});
