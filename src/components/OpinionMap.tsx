"use client";

import { useState } from "react";

// red-dwarfの計算結果を2D散布図として描画する。
// 点は匿名参加者。クラスタ(意見グループ)は凸包の「なわばり」で囲み、
// ホバー(タッチ端末はタップ)でそのグループの特徴的な意見を表示する。

const GROUP_COLORS = ["#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed"];
const GROUP_NAMES = ["A", "B", "C", "D", "E"];

export type PublicMathResult = {
  status: "ok" | "insufficient";
  group_count?: number;
  participants?: { id: number; x: number; y: number; cluster: number | null }[];
  consensus?: {
    agree: { statement_id: number; agree_ratio: number | null }[];
    disagree: { statement_id: number; agree_ratio: number | null }[];
  };
  repness?: Record<string, { statement_id: number; repful_for: string }[]>;
};

type Pt = { x: number; y: number };

// Andrewのmonotone chainによる凸包
function convexHull(points: Pt[]): Pt[] {
  if (points.length <= 2) return points;
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

// 凸包を重心から外側に押し広げて、点が縁に張り付かない「なわばり」にする
function expandHull(hull: Pt[], padding: number): Pt[] {
  const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length;
  const cy = hull.reduce((s, p) => s + p.y, 0) / hull.length;
  return hull.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * padding, y: p.y + (dy / len) * padding };
  });
}

export function OpinionMap({
  result,
  myIndex,
  statementTexts,
}: {
  result: PublicMathResult | null;
  myIndex: number | null;
  statementTexts: Record<number, string>;
}) {
  const [activeGroup, setActiveGroup] = useState<number | null>(null);

  if (!result || result.status !== "ok" || !result.participants?.length) {
    return (
      <p className="rounded-lg border border-dashed border-stone-500 p-6 text-center text-sm text-stone-600">
        意見マップはまだありません。もう少し投票が集まると、意見グループの地図がここに描かれます。
      </p>
    );
  }

  const pts = result.participants;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const pad = 0.28;
  const spanX = Math.max(Math.max(...xs) - Math.min(...xs), 0.01);
  const spanY = Math.max(Math.max(...ys) - Math.min(...ys), 0.01);
  const minX = Math.min(...xs) - spanX * pad;
  const maxX = Math.max(...xs) + spanX * pad;
  const minY = Math.min(...ys) - spanY * pad;
  const maxY = Math.max(...ys) + spanY * pad;

  const W = 480;
  const H = 340;
  const sx = (x: number) => ((x - minX) / (maxX - minX)) * W;
  const sy = (y: number) => H - ((y - minY) / (maxY - minY)) * H;

  // クラスタごとの点となわばり
  const clusterMap = new Map<number, Pt[]>();
  for (const p of pts) {
    if (p.cluster === null) continue;
    if (!clusterMap.has(p.cluster)) clusterMap.set(p.cluster, []);
    clusterMap.get(p.cluster)!.push({ x: sx(p.x), y: sy(p.y) });
  }
  const clusters = [...clusterMap.entries()]
    .map(([cid, members]) => {
      const hull = expandHull(convexHull(members), 22);
      const cx = members.reduce((s, p) => s + p.x, 0) / members.length;
      const cy = members.reduce((s, p) => s + p.y, 0) / members.length;
      return { cid, members, hull, cx, cy };
    })
    .sort((a, b) => b.members.length - a.members.length); // 大きいなわばりを下に描く

  // 近接クラスタのラベルが重ならないよう、縦方向に押しのける
  const LABEL_W = 90;
  const LABEL_H = 26;
  const placed: { cid: number; cx: number; cy: number }[] = [...clusters]
    .sort((a, b) => a.cy - b.cy)
    .map((c) => ({ cid: c.cid, cx: c.cx, cy: c.cy }));
  for (let i = 0; i < placed.length; i++) {
    for (let j = 0; j < i; j++) {
      const dx = Math.abs(placed[i].cx - placed[j].cx);
      const dy = placed[i].cy - placed[j].cy;
      if (dx < LABEL_W && Math.abs(dy) < LABEL_H) {
        placed[i].cy = placed[j].cy + LABEL_H;
      }
    }
  }
  const labelPos = new Map(placed.map((p) => [p.cid, { cx: p.cx, cy: p.cy }]));

  // ホバー中グループの特徴的な意見(上位2件)
  const activeRepness =
    activeGroup !== null
      ? (result.repness?.[String(activeGroup)] ?? [])
          .filter((i) => statementTexts[i.statement_id])
          .slice(0, 2)
      : [];
  const activeCluster = clusters.find((c) => c.cid === activeGroup);

  const consensusAgree = (result.consensus?.agree ?? []).filter(
    (c) => statementTexts[c.statement_id],
  );

  // PCA空間の原点(意見の重心)を通る参考軸
  const axisX = minX < 0 && maxX > 0 ? sx(0) : null;
  const axisY = minY < 0 && maxY > 0 ? sy(0) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-stone-400 bg-white p-4">
        <div className="relative mx-auto w-full max-w-lg">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full"
            role="img"
            aria-label="意見マップ"
            onMouseLeave={() => setActiveGroup(null)}
          >
            {/* 参考軸(意見全体の重心を通る十字) */}
            {axisX !== null && <line x1={axisX} y1={0} x2={axisX} y2={H} stroke="#d6d3d1" strokeWidth={1} />}
            {axisY !== null && <line x1={0} y1={axisY} x2={W} y2={axisY} stroke="#d6d3d1" strokeWidth={1} />}

            {/* クラスタのなわばり(ホバー/タップで意見を表示) */}
            {clusters.map(({ cid, hull, members }) => {
              const color = GROUP_COLORS[cid % GROUP_COLORS.length];
              const active = activeGroup === cid;
              const common = {
                fill: color,
                fillOpacity: active ? 0.18 : 0.09,
                stroke: color,
                strokeOpacity: active ? 0.7 : 0.35,
                strokeWidth: 1.5,
              };
              return (
                <g
                  key={`hull-${cid}`}
                  onMouseEnter={() => setActiveGroup(cid)}
                  onClick={() => setActiveGroup(active ? null : cid)}
                  className="cursor-pointer"
                >
                  {hull.length >= 3 ? (
                    <polygon points={hull.map((p) => `${p.x},${p.y}`).join(" ")} strokeLinejoin="round" {...common} />
                  ) : (
                    // 点が重なって凸包が退化した場合は、全メンバーを覆う円で描く
                    (() => {
                      const mx = members.reduce((s, p) => s + p.x, 0) / members.length;
                      const my = members.reduce((s, p) => s + p.y, 0) / members.length;
                      const r = Math.max(...members.map((p) => Math.hypot(p.x - mx, p.y - my)), 0) + 22;
                      return <circle cx={mx} cy={my} r={r} {...common} />;
                    })()
                  )}
                </g>
              );
            })}

            {/* 参加者の点(自分以外)。自分は最前面に別途描く */}
            {pts.map((p) => {
              if (myIndex !== null && p.id === myIndex) return null;
              const color = p.cluster !== null ? GROUP_COLORS[p.cluster % GROUP_COLORS.length] : "#a8a29e";
              return (
                <circle
                  key={p.id}
                  cx={sx(p.x)}
                  cy={sy(p.y)}
                  r={4.5}
                  fill={color}
                  fillOpacity={0.55}
                  pointerEvents="none"
                />
              );
            })}

            {/* グループラベル */}
            {clusters.map(({ cid, cx, cy, members }) => {
              const color = GROUP_COLORS[cid % GROUP_COLORS.length];
              const label = `${GROUP_NAMES[cid] ?? cid} · ${members.length}人`;
              const w = label.length * 7 + 18;
              return (
                <g
                  key={`label-${cid}`}
                  onMouseEnter={() => setActiveGroup(cid)}
                  onClick={() => setActiveGroup(activeGroup === cid ? null : cid)}
                  className="cursor-pointer"
                >
                  <rect x={cx - w / 2} y={cy - 11} width={w} height={22} rx={11} fill="white" stroke={color} strokeWidth={1.5} />
                  <text x={cx} y={cy + 4} fontSize="11" fontWeight="bold" textAnchor="middle" fill={color}>
                    {label}
                  </text>
                </g>
              );
            })}

            {/* 自分の点とラベルは最前面に描き、なわばりやグループラベルに隠れないようにする */}
            {myIndex !== null &&
              (() => {
                const me = pts.find((p) => p.id === myIndex);
                if (!me) return null;
                const color = me.cluster !== null ? GROUP_COLORS[me.cluster % GROUP_COLORS.length] : "#a8a29e";
                const labelLeft = sx(me.x) < W - 60; // 右端に近ければラベルを左側に出す
                return (
                  <g pointerEvents="none">
                    <circle cx={sx(me.x)} cy={sy(me.y)} r={7} fill={color} strokeWidth={2} className="stroke-stone-900" />
                    <text
                      x={labelLeft ? sx(me.x) + 11 : sx(me.x) - 11}
                      y={sy(me.y) + 4}
                      fontSize="11"
                      fontWeight="bold"
                      textAnchor={labelLeft ? "start" : "end"}
                      className="fill-stone-900"
                      stroke="white"
                      strokeWidth={3}
                      paintOrder="stroke"
                    >
                      あなた
                    </text>
                  </g>
                );
              })()}
          </svg>

          {/* ホバー中グループの意見ツールチップ */}
          {activeGroup !== null && activeCluster && (
            <div
              className="pointer-events-none absolute z-10 w-64 -translate-x-1/2 rounded-lg border bg-white p-3 shadow-lg"
              style={{
                left: `${(activeCluster.cx / W) * 100}%`,
                top: `${(Math.min(activeCluster.cy + 24, H - 10) / H) * 100}%`,
                borderColor: GROUP_COLORS[activeGroup % GROUP_COLORS.length],
              }}
            >
              <p className="mb-1 text-xs font-bold" style={{ color: GROUP_COLORS[activeGroup % GROUP_COLORS.length] }}>
                グループ{GROUP_NAMES[activeGroup] ?? activeGroup}({activeCluster.members.length}人)
              </p>
              {activeRepness.length > 0 ? (
                <ul className="flex flex-col gap-1 text-xs leading-relaxed text-stone-700">
                  {activeRepness.map((i) => (
                    <li key={i.statement_id}>
                      「{statementTexts[i.statement_id]}」
                      <span className="text-stone-600">
                        {i.repful_for === "agree" ? "に賛成しがち" : "に反対しがち"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-stone-600">特徴的な意見はまだ検出されていません</p>
              )}
            </div>
          )}
        </div>
        <p className="mt-2 text-center text-xs text-stone-600">
          近くにいる人ほど投票傾向が似ています · グループに触れると特徴的な意見が見られます
        </p>
      </div>

      {consensusAgree.length > 0 && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4">
          <h3 className="mb-2 text-sm font-semibold text-emerald-900">
            グループを越えて合意された意見
          </h3>
          <ul className="flex flex-col gap-1.5 text-sm text-emerald-900">
            {consensusAgree.map((c) => (
              <li key={c.statement_id}>
                「{statementTexts[c.statement_id]}」
                {c.agree_ratio !== null && (
                  <span className="ml-1 text-xs text-emerald-700">
                    (賛成 {Math.round(c.agree_ratio * 100)}%)
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.repness && Object.keys(result.repness).length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(result.repness).map(([gid, items]) => {
            const visible = items.filter((i) => statementTexts[i.statement_id]).slice(0, 4);
            if (visible.length === 0) return null;
            const g = Number(gid);
            return (
              <div key={gid} className="rounded-lg border border-stone-400 bg-white p-4">
                <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: GROUP_COLORS[g % GROUP_COLORS.length] }} />
                  グループ{GROUP_NAMES[g] ?? g}の特徴的な意見
                </h4>
                <ul className="flex flex-col gap-1.5 text-sm text-stone-700">
                  {visible.map((i) => (
                    <li key={i.statement_id}>
                      「{statementTexts[i.statement_id]}」
                      <span className="ml-1 text-xs text-stone-600">
                        {i.repful_for === "agree" ? "に賛成しがち" : "に反対しがち"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
