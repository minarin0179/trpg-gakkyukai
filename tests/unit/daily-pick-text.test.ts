import test from "node:test";
import assert from "node:assert/strict";
import {
  composeDailyText,
  isMondayJst,
  jstDateKey,
  type DailyPick,
} from "@/lib/daily-pick-text";
import { X_MAX_UNITS, xLength } from "@/lib/digest-text";

const URL = "https://trpg-gakkyukai.com/t/abc123";

test("日付と曜日はJSTで判定する", () => {
  // 2026-09-20T15:00Z = 9/21(月)0:00 JST
  assert.equal(jstDateKey(new Date("2026-09-20T15:00:00Z")), "2026-09-21");
  assert.equal(isMondayJst(new Date("2026-09-20T15:00:00Z")), true);
  assert.equal(isMondayJst(new Date("2026-09-20T14:59:59Z")), false);
  // cron の 11:00 UTC は同じ日の 20:00 JST
  assert.equal(isMondayJst(new Date("2026-09-21T11:00:00Z")), true);
  assert.equal(isMondayJst(new Date("2026-09-22T11:00:00Z")), false);
});

test("紹介文は見出し・タイトル・ハッシュタグ・個別ページのURLを含む", () => {
  const pick: DailyPick = { kind: "hot", id: "abc123", title: "遅刻の扱い", voters: 12 };
  const text = composeDailyText(pick, URL);
  const lines = text.split("\n");
  assert.equal(lines[0], "今日よく話されたテーマ(12人が投票)");
  assert.equal(lines[1], "「遅刻の扱い」");
  assert.ok(lines.includes("#TRPG学級会"));
  assert.equal(lines.at(-1), URL);
});

test("種類ごとに見出しが変わる", () => {
  const base = { id: "a", title: "t", voters: 0 };
  assert.match(composeDailyText({ ...base, kind: "new" }, URL), /^新しいテーマが立ちました/);
  assert.match(composeDailyText({ ...base, kind: "revisit" }, URL), /^こんなテーマも話されています\n/);
  assert.match(
    composeDailyText({ ...base, kind: "revisit", voters: 40 }, URL),
    /^こんなテーマも話されています\(これまでに40人が投票\)/,
  );
});

test("長いタイトルは切り詰めて280単位に収める", () => {
  const pick: DailyPick = { kind: "revisit", id: "a", title: "あ".repeat(100), voters: 1234 };
  const text = composeDailyText(pick, URL);
  assert.ok(xLength(text) <= X_MAX_UNITS, `${xLength(text)} units`);
  assert.match(text, /あ…」/);
  assert.equal(text.split("\n").at(-1), URL);
});
