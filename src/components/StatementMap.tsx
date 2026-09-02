"use client";

import { useState } from "react";
import { GROUP_COLORS, GROUP_NAMES } from "@/lib/group-style";

// 本家Polisレポートの「グラフ」に相当する意見の散布図。
// 意見を主成分負荷(pc1, pc2)の位置に置く: 投票のされ方が似ている意見ほど近く、
// 意見は「それに賛成しやすい参加者がいる側」に置かれる(向きは検証済み)。
// グループのラベルは参加者重心の方向に表示し、地図の向きの手がかりにする

export type MapItem = {
  id: number;
  text: string;
  agree: number;
  disagree: number;
  pass: number;
  x: number;
  y: number;
  // グループごとの内訳(添字 = グループID)。選択カードの横並びバーに使う
  byGroup: { agree: number; disagree: number; pass: number }[] | null;
};

export type Counts = { agree: number; disagree: number; pass: number };

// 選択カード用のミニバー+数値(結果ページの横並び比較と同じ見た目)。beeswarmと共用
export function MiniBar({ label, color, counts }: { label: string; color?: string; counts: Counts }) {
  const t = counts.agree + counts.disagree + counts.pass;
  const pc = (n: number) => (t > 0 ? Math.round((n / t) * 100) : 0);
  return (
    <div>
      <p
        className="mb-1 text-[11px] font-medium text-stone-600 dark:text-stone-400"
        style={color ? { color } : undefined}
      >
        {label}
      </p>
      <div className="h-2 rounded-full bg-stone-100 dark:bg-stone-800">
        {t > 0 && (
          <div className="flex h-2 overflow-hidden rounded-full">
            <div className="bg-emerald-600" style={{ width: `${(counts.agree / t) * 100}%` }} />
            <div className="bg-rose-600" style={{ width: `${(counts.disagree / t) * 100}%` }} />
            <div className="bg-stone-400" style={{ width: `${(counts.pass / t) * 100}%` }} />
          </div>
        )}
      </div>
      {t > 0 ? (
        <p className="mt-0.5 text-[11px] tabular-nums text-stone-600 dark:text-stone-500">
          <span className="font-medium text-emerald-700 dark:text-emerald-500">{pc(counts.agree)}%</span>{" "}
          <span className="font-medium text-rose-700 dark:text-rose-500">{pc(counts.disagree)}%</span>{" "}
          <span>{pc(counts.pass)}%</span> <span>({t}票)</span>
        </p>
      ) : (
        <p className="mt-0.5 text-[11px] text-stone-500">投票なし</p>
      )}
    </div>
  );
}

// 図の点を選ぶ操作はマウス前提になるため、同じ選択をキーボード・支援技術からも
// 行えるプルダウン。意見は最大180件ほどになり得るのでボタンの一覧ではなく選択式にする
// (意見コンパスとビースウォームで共用)
export function StatementSelect({
  items,
  selected,
  onSelect,
}: {
  items: { id: number; text: string }[];
  selected: number | null;
  onSelect: (id: number | null) => void;
}) {
  return (
    <select
      aria-label="意見を選ぶ"
      value={selected ?? ""}
      onChange={(e) => onSelect(e.target.value === "" ? null : Number(e.target.value))}
      className="mt-2 w-full rounded-md border border-stone-300 bg-white px-2 py-1 text-xs text-stone-700"
    >
      <option value="">意見を選ぶ</option>
      {items.map((s) => (
        <option key={s.id} value={s.id}>
          #{s.id} {s.text.length > 30 ? `${s.text.slice(0, 30)}…` : s.text}
        </option>
      ))}
    </select>
  );
}

// 意見マップ(480x340)と同じ横長比。円は高さ基準で収め、左右の余白にラベルを逃がす
const W = 141;
const H = 100;
const PAD = 10;

export function StatementMap({
  items,
  groupDirections,
  withBreakdown = true,
}: {
  items: MapItem[];
  // グループごとの参加者重心の方向(単位ベクトル)。添字 = グループID
  groupDirections: [number, number][];
  // false = 選択カードに割合を出さず本文のみ(テーマページ用。投票中に割合を
  // 見せない設計判断のため。結果ページでは true)
  withBreakdown?: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  // 原点(グループ構造と無相関な位置)を描画の中心に据えた放射レイアウト
  // (本家レポートの放射状グラフと同じ構図。中心からの距離 = グループ判別力)。
  // 少数の外れ値が全体を圧縮しないよう、原点からの半径90パーセンタイルを
  // 超えた分だけを 0.35 倍に圧縮する(縁への張り付きは起こさず、外れ値は最外周に残る)
  const radii = items.map((s) => Math.hypot(s.x, s.y)).sort((a, b) => a - b);
  const r0 = radii[Math.floor(radii.length * 0.9)] || 0.001;
  const compress = (x: number, y: number): [number, number] => {
    const r = Math.hypot(x, y);
    if (r <= r0) return [x, y];
    const rc = r0 + (r - r0) * 0.35;
    return [(x / r) * rc, (y / r) * rc];
  };
  // Yは意見マップ(OpinionMap)と同じ「上が正」の向きに反転して揃える。
  // 2つの図は同一の座標空間なので、上下の向きが違うと読みが転移しない
  const pts = items.map((s) => {
    const [x, y] = compress(s.x, -s.y);
    return { ...s, x, y };
  });
  const dirs = groupDirections.map(([dx, dy]): [number, number] => [dx, -dy]);
  const maxR = Math.max(0.001, ...pts.map((s) => Math.hypot(s.x, s.y)));
  const scale = (H / 2 - PAD) / maxR;
  const px = (v: number) => W / 2 + v * scale;
  const py = (v: number) => H / 2 + v * scale;
  // 原点 = 描画の中心。グループラベルはここから重心方向へ伸ばした
  // 半直線と描画領域の縁の交点に置く
  const ox = W / 2;
  const oy = H / 2;
  const labelPos = (dx: number, dy: number): [number, number] => {
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    let t = Infinity;
    if (ux > 0) t = Math.min(t, (W - 7 - ox) / ux);
    if (ux < 0) t = Math.min(t, (7 - ox) / ux);
    if (uy > 0) t = Math.min(t, (H - 5 - oy) / uy);
    if (uy < 0) t = Math.min(t, (5 - oy) / uy);
    if (!Number.isFinite(t) || t < 0) t = 0;
    return [
      Math.max(7, Math.min(W - 7, ox + ux * t)),
      Math.max(5, Math.min(H - 5, oy + uy * t)),
    ];
  };

  const byId = new Map(items.map((s) => [s.id, s]));
  const sel = selected !== null ? byId.get(selected) : undefined;
  // 図に入るためのタブ位置(選択中の点。未選択なら先頭の点)
  const focusId = selected ?? pts[0]?.id ?? null;

  return (
    // 図・選択カード・見方までを1つの白枠に収める(意見マップの囲いと同じ流儀)
    <div className="rounded-lg border border-stone-300 bg-white p-3 dark:border-stone-700 dark:bg-stone-900">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="意見コンパス。投票のされ方が似ている意見ほど近くに置かれる"
      >
        {/* 各グループの「なわばり」扇形。境界破線で区切られる領域を、そのグループの色で
            外周円まで薄く塗る(意見マップの色付き領域と同じ読み方ができるように) */}
        {(() => {
          const sorted = dirs
            .map(([dx, dy], g) => ({ g, angle: Math.atan2(dy, dx), zero: dx === 0 && dy === 0 }))
            .filter((d) => !d.zero)
            .sort((a, b) => a.angle - b.angle);
          if (sorted.length < 2) return null;
          const outerR = Math.max(
            0.001,
            ...pts.map((s) => Math.hypot(px(s.x) - ox, py(s.y) - oy)),
          );
          // 隣接するグループ方向の中間角 = 扇形の境界
          const bounds = sorted.map((d, i) => {
            const next = sorted[(i + 1) % sorted.length];
            const b = i + 1 < sorted.length ? next.angle : next.angle + 2 * Math.PI;
            return (d.angle + b) / 2;
          });
          return (
            <g>
              {sorted.map((d, i) => {
                const from = i === 0 ? bounds[bounds.length - 1] - 2 * Math.PI : bounds[i - 1];
                const to = bounds[i];
                const steps = 16;
                const arc = Array.from({ length: steps + 1 }, (_, k) => {
                  const a = from + ((to - from) * k) / steps;
                  return `${ox + Math.cos(a) * outerR},${oy + Math.sin(a) * outerR}`;
                });
                return (
                  <polygon
                    key={d.g}
                    points={`${ox},${oy} ${arc.join(" ")}`}
                    fill={GROUP_COLORS[d.g % GROUP_COLORS.length]}
                    opacity={0.06}
                  />
                );
              })}
            </g>
          );
        })()}
        {/* 原点(グループ構造と無相関な意見の位置)の十字線と、原点中心の同心円。
            中心からの距離 = グループ判別力(本家論文のextremityに相当)という読み方の補助線 */}
        {(() => {
          const maxR = Math.max(
            0.001,
            ...pts.map((s) => Math.hypot(px(s.x) - ox, py(s.y) - oy)),
          );
          return (
            <g stroke="#e7e5e4" strokeWidth={0.35} fill="none">
              {[1 / 3, 2 / 3, 1].map((f) => (
                <circle key={f} cx={ox} cy={oy} r={maxR * f} />
              ))}
              <line x1={0} y1={oy} x2={W} y2={oy} />
              <line x1={ox} y1={0} x2={ox} y2={H} />
            </g>
          );
        })()}
        {/* 隣接するグループ方向のちょうど中間へ中心から伸ばす境界線(色分けの区切り)。
            矢印・「AとBの合意」ラベルは一度試したが、この方向の距離の意味が
            グループ数によって変わる(2グループでは第2軸)ため、誤読を招くとして撤去した */}
        {(() => {
          const sorted = dirs
            .map(([dx, dy], g) => ({ g, angle: Math.atan2(dy, dx), zero: dx === 0 && dy === 0 }))
            .filter((d) => !d.zero)
            .sort((a, b) => a.angle - b.angle);
          if (sorted.length < 2) return null;
          const edge = (angle: number): [number, number] => {
            const ux = Math.cos(angle);
            const uy = Math.sin(angle);
            let t = Infinity;
            if (ux > 0) t = Math.min(t, (W - ox) / ux);
            if (ux < 0) t = Math.min(t, -ox / ux);
            if (uy > 0) t = Math.min(t, (H - oy) / uy);
            if (uy < 0) t = Math.min(t, -oy / uy);
            return [ox + ux * t, oy + uy * t];
          };
          return (
            <g stroke="#a8a29e" strokeWidth={0.4} strokeDasharray="1.8 1.8" opacity={0.7}>
              {sorted.map((d, i) => {
                const next = sorted[(i + 1) % sorted.length];
                const b = i + 1 < sorted.length ? next.angle : next.angle + 2 * Math.PI;
                const [x2, y2] = edge((d.angle + b) / 2);
                return <line key={i} x1={ox} y1={oy} x2={x2} y2={y2} />;
              })}
            </g>
          );
        })()}
        {dirs.map(([dx, dy], g) => {
          const [lx, ly] = labelPos(dx, dy);
          return (
            <text
              key={g}
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={5}
              fontWeight={700}
              fill={GROUP_COLORS[g % GROUP_COLORS.length]}
            >
              {GROUP_NAMES[g] ?? g}
            </text>
          );
        })}
        {pts.map((s) => {
          // キーボードのタブ位置は「選択中(未選択なら先頭)の意見」1つだけに置く。
          // 点は数百個になり得るため、全部をタブ順に入れると図を通り抜けられなくなる。
          // ほかの意見へはプルダウンで移動する
          const focusable = s.id === focusId;
          const toggle = () => setSelected(s.id === selected ? null : s.id);
          const dot = (key: string, x: number, y: number, fill: number | string, keyboard: boolean) => (
            <circle
              key={key}
              cx={px(x)}
              cy={py(y)}
              r={s.id === selected ? 2.4 : 1.6}
              fill={typeof fill === "string" ? fill : undefined}
              stroke={s.id === selected ? "#f59e0b" : "none"}
              strokeWidth={0.7}
              className="cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
              opacity={selected === null || s.id === selected ? 0.85 : 0.35}
              onClick={toggle}
              onMouseEnter={() => setSelected(s.id)}
              {...(keyboard
                ? {
                    tabIndex: focusable ? 0 : -1,
                    role: "button" as const,
                    "aria-label": `意見「${s.text.length > 30 ? `${s.text.slice(0, 30)}…` : s.text}」を表示`,
                    onFocus: () => setSelected(s.id),
                    onKeyDown: (e: React.KeyboardEvent<SVGCircleElement>) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle();
                      }
                    },
                  }
                : {})}
            />
          );
          // 賛成した人がいる方向に緑、点対称の位置(反対した人がいる方向)に赤の対で描く。
          // 反対で固まったグループの側にも点が現れるので、どの方向に
          // どんな意見への賛否があるかが読める。
          // キーボード操作は対のうち緑の点だけに付け、タブ位置を二重に作らない
          return [
            dot(`${s.id}-a`, s.x, s.y, "#059669", true),
            dot(`${s.id}-d`, -s.x, -s.y, "#e11d48", false),
          ];
        })}
      </svg>
      <StatementSelect items={items} selected={selected} onSelect={setSelected} />
      <div className="mt-2 min-h-16 rounded-md border border-stone-300 bg-stone-50 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-800">
        {sel ? (
          <>
            <p>{sel.text}</p>
            {withBreakdown && (
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
            )}
          </>
        ) : (
          <p className="text-xs text-stone-500">点を選ぶと意見の内容が表示されます。</p>
        )}
      </div>
      {/* 読み方の補足。常時見せるほどではないので折りたたみ(意見マップと同じ流儀) */}
      <details className="group mt-2">
        <summary className="cursor-pointer list-none text-center text-xs font-medium text-stone-600 underline decoration-stone-400 underline-offset-2 marker:content-none hover:text-stone-800 [&::-webkit-details-marker]:hidden">
          コンパスの見方
        </summary>
        <ul className="mx-auto mt-2 flex max-w-md list-disc flex-col gap-1 pl-5 text-left text-xs leading-relaxed text-stone-600">
          <li>
            点はひとつの意見です。<span className="text-emerald-700">緑</span>は賛成した人がいる方向、
            <span className="text-rose-700">赤</span>は反対した人がいる方向に置かれます(1つの意見が1対)
          </li>
          <li>投票のされ方が似ている意見ほど、近くに並びます</li>
          <li>
            色のついた扇形は各グループの方向です。扇形の奥にある緑の点は、
            そのグループ(2つの扇形の境目なら、その両方)が賛成した意見です
          </li>
          <li>中心に近い点は、グループによらずみんなが同じように投票した意見です</li>
          <li>点を選ぶと、意見の内容が下に表示されます</li>
        </ul>
      </details>
    </div>
  );
}
