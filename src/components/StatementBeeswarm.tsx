"use client";

import { useState } from "react";
import { MiniBar, type Counts } from "./StatementMap";
import { GROUP_COLORS, GROUP_NAMES } from "@/lib/group-style";

// 本家Polisレポートのbeeswarm(意見の割れ方)に相当する1次元プロット。
// 左 = 全員が同じ方向(全員賛成または全員反対)、右 = 賛否が二分。
// x = 2 * min(賛成, 反対) / (賛成 + 反対)。パスは割れ方の計算に含めない

export type BeeswarmItem = {
  id: number;
  text: string;
  agree: number;
  disagree: number;
  pass: number;
  // グループごとの内訳(添字 = グループID)。選択カードの横並びバーに使う
  byGroup: Counts[] | null;
};

const R = 0.9; // 点の半径(viewBox単位)
const W = 100;

function layout(items: { id: number; x: number }[]) {
  // 単純なbeeswarm: x順に置き、重なる場合は上下のレーンへ逃がす
  const placed: { id: number; x: number; lane: number }[] = [];
  const sorted = [...items].sort((a, b) => a.x - b.x);
  let maxLane = 0;
  for (const item of sorted) {
    let lane = 0;
    for (let i = 0; ; i++) {
      lane = i === 0 ? 0 : i % 2 === 1 ? Math.ceil(i / 2) : -Math.ceil(i / 2);
      const collides = placed.some(
        (p) => p.lane === lane && Math.abs(p.x - item.x) < R * 2.2,
      );
      if (!collides) break;
    }
    placed.push({ id: item.id, x: item.x, lane });
    maxLane = Math.max(maxLane, Math.abs(lane));
  }
  return { placed, maxLane };
}

export function StatementBeeswarm({ items }: { items: BeeswarmItem[] }) {
  const [selected, setSelected] = useState<number | null>(null);

  const points = items.map((s) => ({
    id: s.id,
    x: R + ((W - 2 * R) * 2 * Math.min(s.agree, s.disagree)) / (s.agree + s.disagree),
  }));
  const { placed, maxLane } = layout(points);
  // レーンは中央から上下対称に広がるので、高さは (2*maxLane+1) レーン分+余白
  const H = (2 * maxLane + 1) * 2 * R * 1.1 + 2 * R;
  const midY = H / 2;
  const byId = new Map(items.map((s) => [s.id, s]));
  const sel = selected !== null ? byId.get(selected) : undefined;

  return (
    // 図・選択カードを1つの白枠に収める(意見マップ・コンパスの囲いと同じ流儀)
    <div className="rounded-lg border border-stone-300 bg-white p-3 dark:border-stone-700 dark:bg-stone-900">
      <svg
        viewBox={`${-2 * R} ${-2 * R} ${W + 4 * R} ${H + 4 * R}`}
        className="w-full"
        role="img"
        aria-label="意見の割れ方のプロット。左が全員同方向、右が賛否二分"
      >
        {placed.map((p) => {
          const s = byId.get(p.id);
          const color =
            !s || s.agree === s.disagree ? "#a8a29e" : s.agree > s.disagree ? "#059669" : "#e11d48";
          return (
            <circle
              key={p.id}
              cx={p.x}
              cy={midY + p.lane * 2 * R * 1.1}
              r={p.id === selected ? R * 1.6 : R}
              fill={color}
              stroke={p.id === selected ? "#f59e0b" : "none"}
              strokeWidth={0.5}
              className="cursor-pointer"
              opacity={selected === null || p.id === selected ? 0.9 : 0.4}
              onClick={() => setSelected(p.id === selected ? null : p.id)}
              onMouseEnter={() => setSelected(p.id)}
            />
          );
        })}
      </svg>
      <div className="flex justify-between text-[11px] text-stone-600 dark:text-stone-500">
        <span>← 合意的な意見(全員が同じ方向)</span>
        <span>分断的な意見(賛否が二分)→</span>
      </div>
      <div className="mt-2 min-h-16 rounded-md border border-stone-300 bg-stone-50 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800">
        {sel ? (
          <>
            <p>{sel.text}</p>
            <div className="mt-2 grid gap-x-3 gap-y-2 [grid-template-columns:repeat(auto-fit,minmax(7.5rem,1fr))]">
              <MiniBar label="全体" counts={sel} />
              {(sel.byGroup ?? []).map((counts, g) => (
                <MiniBar
                  key={g}
                  label={`グループ${GROUP_NAMES[g] ?? g}`}
                  color={GROUP_COLORS[g % GROUP_COLORS.length]}
                  counts={counts}
                />
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-stone-500">点を選ぶと意見の内容が表示されます。</p>
        )}
      </div>
    </div>
  );
}
