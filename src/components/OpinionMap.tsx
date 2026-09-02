"use client";

import { useState } from "react";
import { usePersonalizationOptional } from "./ThemePersonalization";

// red-dwarfの計算結果を2D散布図として描画する。
// 点は匿名参加者。クラスタ(意見グループ)は凸包の「なわばり」で囲み、
// ホバー(タッチ端末はタップ)でそのグループの特徴的な意見を表示する。

import { GROUP_COLORS, GROUP_NAMES } from "@/lib/group-style";
// 計算結果の型はサーバー側と共有する(math-result.ts が唯一の定義)
import type { PublicMathResult } from "@/lib/math-result";
import { MAP_MIN_VOTES } from "@/lib/config";

// ホバー吹き出し・合意・グループカードで共通の「既定で見せる件数」。
// 絞り込みのルールを全体で揃え、続きは「すべて見る」で展開する。
const PREVIEW_COUNT = 2;


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
  statementTexts,
  variant = "theme",
  afterMap,
}: {
  result: PublicMathResult | null;
  statementTexts: Record<number, string>;
  // "report" は結果ページ用の客観表示: 自分の点を出さず、合意・グループのカード
  // (結果ページでは独立したセクションが担う)も出さない
  variant?: "theme" | "report";
  // マップの直後(合意・グループカードの前)に差し込む内容
  afterMap?: React.ReactNode;
}) {
  // 自分の点の位置(myIndex)と投票状況は cookie 依存の個人化なので context から受け取る。
  // report では Provider なしで描画されるため、個人化は常に空として扱う
  const personalization = usePersonalizationOptional();
  const { myIndex, votes: myVotes } =
    variant === "report" || !personalization
      ? { myIndex: null, votes: {} as Record<number, number> }
      : personalization;
  const [activeGroup, setActiveGroup] = useState<number | null>(null);
  const [showAllConsensus, setShowAllConsensus] = useState(false);

  if (!result || result.status !== "ok" || !result.participants?.length) {
    return (
      <p className="rounded-lg border border-dashed border-stone-500 p-6 text-center text-sm text-stone-600">
        意見マップはまだありません。もう少し投票が集まると、意見グループの地図がここに描かれます。
      </p>
    );
  }

  const pts = result.participants;
  // 公式の計算結果における自分のグループ。7票未満などで未クラスタなら null。
  const officialCluster =
    myIndex !== null ? (pts.find((p) => p.id === myIndex)?.cluster ?? null) : null;

  // 自分の点のライブ投影(本家Polisと同じ方式)。公開されているPCAの軸(意見ごとの
  // 成分と平均)に自分の投票を掛けるだけなので、再計算やリロードを待たずに
  // 投票のたびに自分の点がすぐ動く。材料が無い古い計算結果では従来どおり
  // 公式位置(myIndex)のみで表示する
  let liveSelf: { x: number; y: number } | null = null;
  const proj = result.projection;
  if (proj && proj.n_statements > 0) {
    let lx = 0;
    let ly = 0;
    let n = 0;
    for (const [sid, v] of Object.entries(myVotes)) {
      const s = proj.statements[sid];
      if (!s) continue;
      lx += (v - s[2]) * s[0];
      ly += (v - s[2]) * s[1];
      n++;
    }
    if (n > 0) {
      const scale = Math.sqrt(proj.n_statements / n);
      liveSelf = { x: lx * scale, y: ly * scale };
    }
  }

  // 自分のグループの暫定判定(ライブ)。本計算のグループ分けはk-means
  // (=「最も近い重心」への割り当て)なので、公開されている各グループの
  // 重心に対して同じ規則を適用すれば、公式の境界の引き方を再現できる。
  // 公式ルールに合わせ、マップ参加基準(通常7票)に達するまでは判定しない。
  // 30分ごとの本計算が来たら公式の割り当てで上書きされる暫定表示
  const clusterThreshold = result.threshold_used ?? MAP_MIN_VOTES;
  let liveCluster: number | null = null;
  if (liveSelf !== null && Object.keys(myVotes).length >= clusterThreshold) {
    const acc = new Map<number, { x: number; y: number; n: number }>();
    for (const p of pts) {
      if (p.cluster === null) continue;
      const a = acc.get(p.cluster) ?? { x: 0, y: 0, n: 0 };
      acc.set(p.cluster, { x: a.x + p.x, y: a.y + p.y, n: a.n + 1 });
    }
    let best = Infinity;
    for (const [cid, a] of acc) {
      const d = Math.hypot(liveSelf.x - a.x / a.n, liveSelf.y - a.y / a.n);
      if (d < best) {
        best = d;
        liveCluster = cid;
      }
    }
  }

  // 表示に使う自分のグループ。点の表示位置と整合させる:
  // ライブ投影で描いているときは暫定判定、公式位置で描いているときは公式の割り当て
  const myCluster = liveSelf !== null ? liveCluster : officialCluster;

  // ライブ投影中の自分の点が描画範囲の外に出ないよう、範囲計算に含める
  const xs = [...pts.map((p) => p.x), ...(liveSelf ? [liveSelf.x] : [])];
  const ys = [...pts.map((p) => p.y), ...(liveSelf ? [liveSelf.y] : [])];
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

  // 完全に同じ投票をした参加者は数学的に同一座標になり、点が1つにしか見えない。
  // 同一座標の点は小さな輪状にほどいて全員を可視化する(半透明の重なりが密度表現になる)。
  // 乱数でなくインデックス順の決定的な配置にし、再描画で位置が揺れないようにする
  const displayPos = new Map<number, { x: number; y: number }>();
  {
    const byPos = new Map<string, typeof pts>();
    for (const p of pts) {
      const key = `${p.x.toFixed(4)},${p.y.toFixed(4)}`;
      if (!byPos.has(key)) byPos.set(key, []);
      byPos.get(key)!.push(p);
    }
    for (const group of byPos.values()) {
      const gx = sx(group[0].x);
      const gy = sy(group[0].y);
      if (group.length === 1) {
        displayPos.set(group[0].id, { x: gx, y: gy });
        continue;
      }
      const ringR = Math.min(3.5 + group.length, 10);
      group.forEach((p, i) => {
        const ang = (2 * Math.PI * i) / group.length;
        displayPos.set(p.id, { x: gx + ringR * Math.cos(ang), y: gy + ringR * Math.sin(ang) });
      });
    }
  }

  // クラスタごとの点となわばり
  const HULL_MARGIN = 22;
  const clusterMap = new Map<number, Pt[]>();
  for (const p of pts) {
    if (p.cluster === null) continue;
    if (!clusterMap.has(p.cluster)) clusterMap.set(p.cluster, []);
    clusterMap.get(p.cluster)!.push(displayPos.get(p.id)!);
  }
  const clusters = [...clusterMap.entries()]
    .map(([cid, members]) => {
      const hull = expandHull(convexHull(members), HULL_MARGIN);
      const cx = members.reduce((s, p) => s + p.x, 0) / members.length;
      const cy = members.reduce((s, p) => s + p.y, 0) / members.length;
      return { cid, members, hull, cx, cy };
    })
    .sort((a, b) => b.members.length - a.members.length); // 大きいなわばりを下に描く

  // 近接クラスタのラベルが重ならないよう、縦方向に押しのける
  const LABEL_W = 90;
  const LABEL_H = 26;
  // ラベルは重心ではなく「なわばり上端の点のない帯」(凸包はHULL_MARGINぶん外側に
  // 押し広げてあるので、その帯に点は無い)に置き、密集した中心部の点を覆わないようにする
  const labelAnchorY = (c: (typeof clusters)[number]): number => {
    const topY =
      c.hull.length >= 3
        ? Math.min(...c.hull.map((p) => p.y))
        : Math.min(...c.members.map((p) => p.y)) -
          (Math.max(...c.members.map((p) => Math.hypot(p.x - c.cx, p.y - c.cy)), 0) + HULL_MARGIN);
    return Math.max(topY + LABEL_H / 2 - 4, LABEL_H / 2 + 2);
  };
  const placed: { cid: number; cx: number; cy: number }[] = [...clusters]
    .sort((a, b) => a.cy - b.cy)
    .map((c) => ({
      cid: c.cid,
      cx: Math.min(Math.max(c.cx, LABEL_W / 2 + 2), W - LABEL_W / 2 - 2),
      cy: labelAnchorY(c),
    }));
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

  // 各グループラベルの矩形(「あなた」ラベルの重なり回避に使う)
  const groupLabelRects = clusters.map(({ cid, members }) => {
    const pos = labelPos.get(cid)!;
    const label = `${GROUP_NAMES[cid] ?? cid} · ${members.length}人`;
    const w = label.length * 7 + 18;
    return { x0: pos.cx - w / 2, y0: pos.cy - 11, x1: pos.cx + w / 2, y1: pos.cy + 11 };
  });

  // ホバー中グループの特徴的な意見(既定件数)。下のカードと同じ絞り込みルール。
  const activeRepness =
    activeGroup !== null
      ? (result.repness?.[String(activeGroup)] ?? [])
          .filter((i) => statementTexts[i.statement_id])
          .slice(0, PREVIEW_COUNT)
      : [];
  const activeCluster = clusters.find((c) => c.cid === activeGroup);

  // グループを越えた合意。賛成で一致した意見も、反対で一致した意見も、どちらも合意として扱う
  // (反対の合意 = 全員がその意見を退けた、という共有された認識)。
  const consensusAgree = (result.consensus?.agree ?? []).filter(
    (c) => statementTexts[c.statement_id],
  );
  const consensusDisagree = (result.consensus?.disagree ?? []).filter(
    (c) => statementTexts[c.statement_id],
  );
  const hasConsensus = consensusAgree.length > 0 || consensusDisagree.length > 0;

  // 既定では方向ごと上位数件だけ見せ、「すべて見る」で有意な合意を全部展開する。
  // 合意は am/dm(賛成率×確からしさ)の降順で並んでいるので、先頭が代表的。
  const agreeShown = showAllConsensus ? consensusAgree : consensusAgree.slice(0, PREVIEW_COUNT);
  const disagreeShown = showAllConsensus
    ? consensusDisagree
    : consensusDisagree.slice(0, PREVIEW_COUNT);
  const hiddenConsensusCount =
    consensusAgree.length - agreeShown.length + (consensusDisagree.length - disagreeShown.length);

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
            onClick={() => setActiveGroup(null)}
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
                  onClick={(e) => {
                    // トグルにするとiOSのhover疑似発火(mouseenter→click)で開いた直後に
                    // 閉じてしまうため、常にそのグループを選択する(閉じるは空白タップ)。
                    e.stopPropagation();
                    setActiveGroup(cid);
                  }}
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
              // グループ未割当(7票未満)の参加者もグレーで描く。隠すと「N人が投票」との
              // 数のギャップが不信感につながるため、表示したうえで下の凡例で意味を説明する
              const color = p.cluster !== null ? GROUP_COLORS[p.cluster % GROUP_COLORS.length] : "#a8a29e";
              const dp = displayPos.get(p.id)!;
              return (
                <circle
                  key={p.id}
                  cx={dp.x}
                  cy={dp.y}
                  r={4.5}
                  fill={color}
                  fillOpacity={0.55}
                  pointerEvents="none"
                />
              );
            })}

            {/* グループラベル(近接時は縦にずらして重なりを避ける) */}
            {clusters.map(({ cid, members }) => {
              const { cx, cy } = labelPos.get(cid)!;
              const color = GROUP_COLORS[cid % GROUP_COLORS.length];
              const label = `${GROUP_NAMES[cid] ?? cid} · ${members.length}人`;
              const w = label.length * 7 + 18;
              return (
                <g
                  key={`label-${cid}`}
                  onMouseEnter={() => setActiveGroup(cid)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveGroup(cid);
                  }}
                  className="cursor-pointer"
                >
                  <rect x={cx - w / 2} y={cy - 11} width={w} height={22} rx={11} fill="white" stroke={color} strokeWidth={1.5} />
                  <text x={cx} y={cy + 4} fontSize="11" fontWeight="bold" textAnchor="middle" fill={color}>
                    {label}
                  </text>
                </g>
              );
            })}

            {/* 自分の点とラベルは最前面に描き、なわばりやグループラベルに隠れないようにする。
                位置はライブ投影があればそれを優先(投票のたびに動く)、無ければ公式位置 */}
            {(liveSelf !== null || myIndex !== null) &&
              (() => {
                const me = myIndex !== null ? pts.find((p) => p.id === myIndex) : undefined;
                // 色は myCluster(表示位置と整合するグループ判定)に従う。
                // 閾値未満・判定不能の間はグレー
                const color =
                  myCluster != null ? GROUP_COLORS[myCluster % GROUP_COLORS.length] : "#a8a29e";
                const pos = liveSelf
                  ? { x: sx(liveSelf.x), y: sy(liveSelf.y) }
                  : me
                    ? displayPos.get(me.id)!
                    : null;
                if (!pos) return null;
                const { x: mx, y: my } = pos;
                const TW = 34; // 「あなた」の概算幅
                const HH = 8; // テキスト矩形の半高
                // 点の右→左→上→下の順に、グループラベルと重ならず画面内に収まる位置を選ぶ
                const candidates = [
                  { anchor: "start" as const, tx: mx + 11, ty: my + 4, x0: mx + 9, y0: my - HH, x1: mx + 11 + TW, y1: my + HH },
                  { anchor: "end" as const, tx: mx - 11, ty: my + 4, x0: mx - 11 - TW, y0: my - HH, x1: mx - 9, y1: my + HH },
                  { anchor: "middle" as const, tx: mx, ty: my - 12, x0: mx - TW / 2, y0: my - 22, x1: mx + TW / 2, y1: my - 8 },
                  { anchor: "middle" as const, tx: mx, ty: my + 18, x0: mx - TW / 2, y0: my + 8, x1: mx + TW / 2, y1: my + 22 },
                ];
                const overlaps = (c: (typeof candidates)[number], g: (typeof groupLabelRects)[number]) =>
                  c.x0 < g.x1 && c.x1 > g.x0 && c.y0 < g.y1 && c.y1 > g.y0;
                const inBounds = (c: (typeof candidates)[number]) => c.x0 >= 0 && c.x1 <= W && c.y0 >= 0 && c.y1 <= H;
                const chosen =
                  candidates.find((c) => inBounds(c) && !groupLabelRects.some((g) => overlaps(c, g))) ??
                  candidates.find((c) => inBounds(c)) ??
                  candidates[0];
                return (
                  <g pointerEvents="none">
                    <circle cx={mx} cy={my} r={7} fill={color} strokeWidth={2} className="stroke-stone-900" />
                    <text
                      x={chosen.tx}
                      y={chosen.ty}
                      fontSize="11"
                      fontWeight="bold"
                      textAnchor={chosen.anchor}
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
                // 幅256px(w-64)を中央寄せ(translate-x-1/2)するため、左右に
                // はみ出さないよう中心位置を [136px, 100%-136px] にクランプする
                // (半幅128px + 余白8px)。スマホの左端切れを防ぐ。
                left: `clamp(136px, ${(activeCluster.cx / W) * 100}%, calc(100% - 136px))`,
                top: `${(Math.min(activeCluster.cy + 24, H - 10) / H) * 100}%`,
                borderColor: GROUP_COLORS[activeGroup % GROUP_COLORS.length],
              }}
            >
              <p className="mb-1 text-xs font-bold" style={{ color: GROUP_COLORS[activeGroup % GROUP_COLORS.length] }}>
                グループ{GROUP_NAMES[activeGroup] ?? activeGroup}({activeCluster.members.length}人)
                {activeGroup === myCluster && (
                  <span className="ml-1.5 rounded-full bg-stone-900 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    あなた
                  </span>
                )}
              </p>
              {activeRepness.length > 0 ? (
                <ul className="flex flex-col gap-1 text-xs leading-relaxed">
                  {activeRepness.map((i) => (
                    <li
                      key={i.statement_id}
                      className={i.repful_for === "agree" ? "text-emerald-700" : "text-rose-700"}
                    >
                      「{statementTexts[i.statement_id]}」に{i.repful_for === "agree" ? "賛成" : "反対"}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-stone-600">特徴的な意見はまだ見つかっていません。</p>
              )}
            </div>
          )}
        </div>
        {/* マップの読み方。常時見せるほどではない補足なので折りたたみにする */}
        <details className="group mt-2">
          <summary className="cursor-pointer list-none text-center text-xs font-medium text-stone-600 underline decoration-stone-400 underline-offset-2 marker:content-none hover:text-stone-800 [&::-webkit-details-marker]:hidden">
            マップの見方
          </summary>
          <ul className="mx-auto mt-2 flex max-w-md list-disc flex-col gap-1 pl-5 text-left text-xs leading-relaxed text-stone-600">
            <li>点はひとりの参加者です。投票の傾向が近い人ほど近くに置かれます</li>
            <li>縦軸・横軸そのものに特定の意味はありません</li>
            <li>
              色のついた領域は投票傾向が似た人のグループです。グループをタップすると、
              そのグループの特徴的な意見が見られます
            </li>
            <li>グレーの点は、投票がまだ少なくグループが決まっていない参加者です</li>
            {variant !== "report" && (
              <li>投票すると、あなたの位置がすぐにマップへ反映されます({MAP_MIN_VOTES}件以上でグループも暫定表示され、定期の再計算で確定します)</li>
            )}
          </ul>
        </details>
      </div>

      {/* マップ直後・カード群の前の差し込み枠(テーマページでは意見コンパスが入る。
          マップと同一の座標空間なので、連続して見せると向きの読みが転移する) */}
      {afterMap}

      {variant !== "report" && hasConsensus && (
        <div className="rounded-lg border border-emerald-300 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-emerald-900">
            グループを越えて意見が一致したもの
          </h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            {agreeShown.map((c) => (
              <li key={`agree-${c.statement_id}`} className="text-emerald-700">
                「{statementTexts[c.statement_id]}」
                {c.agree_ratio !== null && (
                  <span className="ml-1 text-xs font-medium">
                    賛成 {Math.round(c.agree_ratio * 100)}%
                  </span>
                )}
              </li>
            ))}
            {disagreeShown.map((c) => (
              <li key={`disagree-${c.statement_id}`} className="text-rose-700">
                「{statementTexts[c.statement_id]}」
                {c.agree_ratio !== null && (
                  <span className="ml-1 text-xs font-medium">
                    反対 {Math.round(c.agree_ratio * 100)}%
                  </span>
                )}
              </li>
            ))}
          </ul>
          {(hiddenConsensusCount > 0 || showAllConsensus) && (
            <button
              type="button"
              onClick={() => setShowAllConsensus((v) => !v)}
              className="mt-2.5 text-xs font-medium text-stone-700 underline hover:text-stone-900"
            >
              {showAllConsensus ? "折りたたむ" : "すべて見る"}
            </button>
          )}
        </div>
      )}

      {variant !== "report" && clusters.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {/* 全グループを表示する。特徴的な意見が無いグループもカードを残し、
              「まだ検出されていません」と出す(吹き出しの表示と揃える) */}
          {[...clusters]
            .sort((a, b) => a.cid - b.cid)
            .map(({ cid }) => (
              <GroupRepnessCard
                key={cid}
                cid={cid}
                isMine={cid === myCluster}
                items={(result.repness?.[String(cid)] ?? []).filter(
                  (i) => statementTexts[i.statement_id],
                )}
                statementTexts={statementTexts}
              />
            ))}
        </div>
      )}
    </div>
  );
}

// グループごとの特徴的な意見カード。既定は PREVIEW_COUNT 件だけ見せ、
// 「すべて見る」で残りを展開する(合意の折りたたみと同じ絞り込みルール)。
function GroupRepnessCard({
  cid,
  items,
  isMine,
  statementTexts,
}: {
  cid: number;
  items: { statement_id: number; repful_for: string }[];
  isMine: boolean;
  statementTexts: Record<number, string>;
}) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? items : items.slice(0, PREVIEW_COUNT);
  const hidden = items.length - shown.length;
  return (
    <div className="rounded-lg border border-stone-400 bg-white p-4">
      <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: GROUP_COLORS[cid % GROUP_COLORS.length] }}
        />
        グループ{GROUP_NAMES[cid] ?? cid}の特徴的な意見
        {isMine && (
          <span className="rounded-full bg-stone-900 px-1.5 py-0.5 text-[10px] font-medium text-white">
            あなた
          </span>
        )}
      </h4>
      {items.length > 0 ? (
        <>
          <ul className="flex flex-col gap-1.5 text-sm">
            {shown.map((i) => (
              <li
                key={i.statement_id}
                className={i.repful_for === "agree" ? "text-emerald-700" : "text-rose-700"}
              >
                「{statementTexts[i.statement_id]}」に{i.repful_for === "agree" ? "賛成" : "反対"}
              </li>
            ))}
          </ul>
          {(hidden > 0 || showAll) && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-2 text-xs font-medium text-stone-700 underline hover:text-stone-900"
            >
              {showAll ? "折りたたむ" : "すべて見る"}
            </button>
          )}
        </>
      ) : (
        <p className="text-sm text-stone-500">特徴的な意見はまだ見つかっていません。</p>
      )}
    </div>
  );
}
