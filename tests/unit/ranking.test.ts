import test from "node:test";
import assert from "node:assert/strict";
import { hotScore, compareByHot } from "@/lib/ranking";
import { RANKING } from "@/lib/config";

const DAY = 86_400_000;
const now = Date.parse("2026-09-12T00:00:00Z");
const daysAgo = (d: number) => new Date(now - d * DAY);

test("窓ありでは分子が直近の投票者数になり、累計の外れ値に引きずられない", () => {
  if (RANKING.windowDays === null) return; // 累計に戻した設定では対象外
  // 公開初日のバズで累計1,262人だが直近は64人のテーマ vs 3日前に立って直近49人のテーマ
  const launch = { voterCount: 1262, recentVoterCount: 64, createdAt: daysAgo(13.5) };
  const fresh = { voterCount: 49, recentVoterCount: 49, createdAt: daysAgo(3.1) };
  assert.ok(hotScore(fresh, now) > hotScore(launch, now));
  // 同じ累計でも直近が多い方が上
  const a = { voterCount: 300, recentVoterCount: 30, createdAt: daysAgo(10) };
  const b = { voterCount: 300, recentVoterCount: 5, createdAt: daysAgo(10) };
  assert.ok(hotScore(a, now) > hotScore(b, now));
});

test("recentVoterCount が無い行は累計で代用し、例外にならない", () => {
  const r = { voterCount: 40, createdAt: daysAgo(2) };
  assert.equal(hotScore(r, now), 40 / Math.pow(4, RANKING.gravity));
});

test("減衰: 同じ分子なら新しいテーマが上", () => {
  const young = { voterCount: 20, recentVoterCount: 20, createdAt: daysAgo(1) };
  const old = { voterCount: 20, recentVoterCount: 20, createdAt: daysAgo(6) };
  assert.ok(hotScore(young, now) > hotScore(old, now));
});

test("compareByHot: 同点(直近0人)は累計の多い順、さらに同じなら新しい順", () => {
  const rows = [
    { id: "c", voterCount: 50, recentVoterCount: 0, createdAt: daysAgo(20) },
    { id: "a", voterCount: 200, recentVoterCount: 0, createdAt: daysAgo(20) },
    { id: "b", voterCount: 50, recentVoterCount: 0, createdAt: daysAgo(15) },
    { id: "hot", voterCount: 12, recentVoterCount: 12, createdAt: daysAgo(1) },
  ];
  const sorted = [...rows].sort((x, y) => compareByHot(x, y, now));
  assert.deepEqual(
    sorted.map((r) => r.id),
    RANKING.windowDays === null ? ["a", "hot", "b", "c"] : ["hot", "a", "b", "c"],
  );
});
