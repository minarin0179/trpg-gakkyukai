import test from "node:test";
import assert from "node:assert/strict";
import {
  X_MAX_UNITS,
  composeDigestText,
  formatWeekRange,
  isoWeekKey,
  parseWeekKey,
  previousWeekStart,
  startOfWeekJst,
  truncateToUnits,
  weekStartFromKey,
  weekStartKey,
  xLength,
  type DigestBody,
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
  assert.equal(
    xLength("https://trpg-gakkyukai.com/digest/2026-W36"),
    23,
  );
  assert.equal(xLength("今週 https://trpg-gakkyukai.com/digest/2026-W36"), 4 + 1 + 23);
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

function bodyOf(titles: string[], consensus: string[]): DigestBody {
  return {
    weekStart: "2026-08-31",
    weekKey: "2026-W36",
    range: "8/31〜9/6",
    mostVoted: titles.map((title, i) => ({
      id: `theme${i}`,
      title,
      voterCount: 10,
      statementCount: 5,
    })),
    newConsensus: consensus.map((text, i) => ({
      themeId: `theme${i}`,
      themeTitle: "テーマ",
      statementId: i,
      text,
      agreeRatio: 0.8,
    })),
    quietNew: [],
    totals: { votes: 100, statements: 10, themes: 2, voters: 20 },
  };
}

const URL = "https://trpg-gakkyukai.com/digest/2026-W36";

test("投稿の下書きは見出し・本文・URLで構成され、上限に収まる", () => {
  const text = composeDigestText(bodyOf(["遅刻の扱い", "キャラシの提出期限"], ["雑談は歓迎"]), URL);
  const lines = text.split("\n");
  assert.equal(lines[0], "今週のTRPG学級会(8/31〜9/6)");
  assert.equal(lines[1], "投票が多かったテーマ:「遅刻の扱い」「キャラシの提出期限」");
  assert.equal(lines[2], "新しく見つかった合意:「雑談は歓迎」");
  assert.equal(lines[3], URL);
  assert.ok(xLength(text) <= X_MAX_UNITS);
});

test("長いタイトルは切り詰め、それでも入らない行は落とす", () => {
  const long = "あ".repeat(100);
  const text = composeDigestText(bodyOf([long, long], [long]), URL);
  assert.ok(xLength(text) <= X_MAX_UNITS, `over limit: ${xLength(text)}`);
  assert.ok(text.includes("…"));
  assert.ok(text.endsWith(URL));
});

test("該当が無いセクションは行ごと出さない", () => {
  const text = composeDigestText(bodyOf([], []), URL);
  assert.equal(text, `今週のTRPG学級会(8/31〜9/6)\n${URL}`);
});
