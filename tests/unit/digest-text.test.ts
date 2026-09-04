import test from "node:test";
import assert from "node:assert/strict";
import {
  X_MAX_UNITS,
  agreePercent,
  composeDigestText,
  disagreePercent,
  isDigestBody,
  legacyTotals,
  splitDistance,
  voteTotal,
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
    version: 2,
    weekStart: "2026-08-31",
    weekEnd: "2026-09-06",
    totals: { votes: 100, statements: 10, newThemes: 2, voters: 20 },
    featured: titles.map((title, i) => ({
      id: `theme${i}`,
      title,
      weekVoters: 10,
      weekStatements: 2,
      totalVoters: 30,
      totalStatements: 12,
      groups: null,
      consensus: null,
      divisive: null,
    })),
    newConsensus: consensus.map((text, i) => ({
      themeId: `theme${i}`,
      themeTitle: "テーマ",
      statementId: i,
      text,
      agree: 40,
      disagree: 5,
      pass: 3,
      agreeRatio: 40 / 45,
    })),
    contested: [],
    newThemes: { count: 2, items: [] },
  };
}

const URL = "https://trpg-gakkyukai.com/digest/2026-W36";

test("週の終わりは同じ週の日曜(閉区間)", () => {
  assert.equal(weekEndKey(weekStartFromKey("2026-08-31")), "2026-09-06");
});

test("投稿の下書きは見出し・本文・URLで構成され、上限に収まる", () => {
  const text = composeDigestText(bodyOf(["遅刻の扱い", "キャラシの提出期限"], ["雑談は歓迎"]), URL);
  const lines = text.split("\n");
  assert.equal(lines[0], "今週のTRPG学級会(8/31〜9/6)");
  assert.equal(lines[1], "今週のテーマ:「遅刻の扱い」「キャラシの提出期限」");
  assert.equal(lines[2], "賛成が集まった意見:「雑談は歓迎」");
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

test("isDigestBody は version 2 の形だけを通す", () => {
  const body = bodyOf(["遅刻の扱い"], ["雑談は歓迎"]);
  assert.equal(isDigestBody(body), true);
  // 版が違う・版が無い(旧形式)行は通さない
  assert.equal(isDigestBody({ ...body, version: 1 }), false);
  assert.equal(isDigestBody({ ...body, version: undefined }), false);
  // 旧形式の実物に近い形(mostVoted / quietNew / totals.themes)も弾く
  assert.equal(
    isDigestBody({
      weekStart: "2026-08-31",
      weekKey: "2026-W36",
      range: "8/31〜9/6",
      mostVoted: [],
      newConsensus: [],
      quietNew: [],
      totals: { votes: 1, statements: 1, themes: 1, voters: 1 },
    }),
    false,
  );
  // 必須の項目が欠けている・型が違うものも弾く
  assert.equal(isDigestBody({ ...body, featured: null }), false);
  assert.equal(isDigestBody({ ...body, contested: undefined }), false);
  assert.equal(isDigestBody({ ...body, newThemes: { count: "2", items: [] } }), false);
  assert.equal(isDigestBody({ ...body, totals: { votes: 1 } }), false);
  assert.equal(isDigestBody(null), false);
  assert.equal(isDigestBody([]), false);
});

test("旧形式からは合計だけを拾う(themes は newThemes として読む)", () => {
  assert.deepEqual(
    legacyTotals({ totals: { votes: 100, statements: 10, themes: 2, voters: 20 } }),
    { votes: 100, statements: 10, newThemes: 2, voters: 20 },
  );
  // 壊れた値は0として扱い、表示だけは成立させる
  assert.deepEqual(legacyTotals({ totals: {} }), {
    votes: 0,
    statements: 0,
    newThemes: 0,
    voters: 0,
  });
  assert.equal(legacyTotals({}), null);
  assert.equal(legacyTotals("x"), null);
});

test("割合はパスを母数から外し、賛成と反対の合計は必ず100%になる", () => {
  const s = { agree: 87, disagree: 13, pass: 20 };
  assert.equal(voteTotal(s), 120);
  assert.equal(agreePercent(s), 87);
  assert.equal(disagreePercent(s), 13);
  // 個別に丸めると101%になる組み合わせでも合計は100%
  const odd = { agree: 5, disagree: 4, pass: 0 };
  assert.equal(agreePercent(odd) + disagreePercent(odd), 100);
  // 全員パス(賛否0)は0%として扱い、ゼロ除算を出さない
  assert.equal(agreePercent({ agree: 0, disagree: 0 }), 0);
});

test("50:50 からの隔たりは真っ二つで0、一方的なほど1に近づく", () => {
  assert.equal(splitDistance({ agree: 50, disagree: 50 }), 0);
  assert.equal(splitDistance({ agree: 100, disagree: 0 }), 1);
  assert.ok(splitDistance({ agree: 6, disagree: 4 }) < splitDistance({ agree: 8, disagree: 2 }));
  // 賛否が1票も無い意見は「割れている」とは言えないので最も遠い扱い
  assert.equal(splitDistance({ agree: 0, disagree: 0 }), 1);
});
