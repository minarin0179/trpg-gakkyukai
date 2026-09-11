// 人気タブの並び順(時間減衰ランキング)。DBやReactに依存しない純関数にして
// テストできるようにしてある。式と窓の設定は config.ts の RANKING を参照。

import { RANKING } from "./config";

export type Rankable = {
  voterCount: number; // 累計のユニーク投票者数
  recentVoterCount?: number; // 直近 RANKING.windowDays 日のユニーク投票者数(窓あり時)
  createdAt: Date;
};

// Hacker News方式: 投票者数を経過時間で減衰させ、古いテーマを自然に沈める。
// score = 分子 / (経過日数 + 2)^gravity
// 分子は窓あり(RANKING.windowDays が数値)なら直近の投票者数、窓なしなら累計。
// 窓ありで recentVoterCount が無い行(古いキャッシュ等)は累計で代用する。
export function hotScore(r: Rankable, now: number = Date.now()): number {
  const ageDays = (now - r.createdAt.getTime()) / 86_400_000;
  const numerator =
    RANKING.windowDays !== null ? (r.recentVoterCount ?? r.voterCount) : r.voterCount;
  return numerator / Math.pow(ageDays + 2, RANKING.gravity);
}

// 勢いの降順。窓ありでは「直近の投票者が0人」のテーマが大量に同点(score 0)になるため、
// 同点は累計投票者数の多い順、それも同じなら新しい順で安定させる
// (DBの取得順に依存した並びにしないため)。
export function compareByHot(a: Rankable, b: Rankable, now: number = Date.now()): number {
  return (
    hotScore(b, now) - hotScore(a, now) ||
    b.voterCount - a.voterCount ||
    b.createdAt.getTime() - a.createdAt.getTime()
  );
}
