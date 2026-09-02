"use client";

import { useState } from "react";
import { usePersonalizationOptional } from "./ThemePersonalization";

// red-dwarfの計算結果を2D散布図として描画する。
// 点は匿名参加者。クラスタ(意見グループ)は凸包の「なわばり」で囲み、
// ホバー(タッチ端末はタップ)でそのグループの特徴的な意見を表示する。

import { GROUP_COLORS, GROUP_NAMES } from "@/lib/group-style";
// 計算結果の型はサーバー側と共有する(math-result.ts が唯一の定義)
import type { MapPayload } from "@/lib/math-result";
import { MAP_MIN_VOTES } from "@/lib/config";
// 座標・凸包・ラベル配置の計算は純関数として切り出してある
import {
  type Pt,
  buildClusters,
  extents,
  nearestCluster,
  placeLabels,
  placeSelfLabel,
  projectSelf,
  spreadCoincident,
} from "@/lib/opinion-map-layout";

// ホバー吹き出し・合意・グループカードで共通の「既定で見せる件数」。
// 絞り込みのルールを全体で揃え、続きは「すべて見る」で展開する。
const PREVIEW_COUNT = 2;

// 点の半径と、グループ未割当(7票未満)の点の色
const POINT_R = 4.5;
const UNCLUSTERED_COLOR = "#a8a29e";

// 参加者の点をまとめて1つのパス文字列にする。参加者1000人規模だと
// 1点1要素の <circle> がSSRしたHTMLの大半を占めるため、クラスタごとに
// 1つの <path> へ畳む(点1つ=半円の円弧2つのサブパス)。
// 座標は小数2桁に丸める(480×340のviewBoxでは表示上の差は出ない)
function pointsPath(positions: Pt[]): string {
  let d = "";
  for (const pos of positions) {
    d += `M${pos.x.toFixed(2)} ${pos.y.toFixed(2)}m${-POINT_R} 0a${POINT_R} ${POINT_R} 0 1 0 ${POINT_R * 2} 0a${POINT_R} ${POINT_R} 0 1 0 ${-POINT_R * 2} 0`;
  }
  return d;
}

export function OpinionMap({
  result,
  statementTexts,
  variant = "theme",
  afterMap,
}: {
  result: MapPayload | null;
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

  if (!result || result.pts.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-stone-500 p-6 text-center text-sm text-stone-600">
        意見マップはまだありません。もう少し投票が集まると、意見グループの地図がここに描かれます。
      </p>
    );
  }

  const pts = result.pts;
  // 自分の点の配列位置。myIndex は行列インデックス(pidMap の値)で、
  // participants には欠番があり得るため配列の位置とは一致しない
  const myPos = myIndex !== null ? pts.findIndex((p) => p[3] === myIndex) : -1;
  // 公式の計算結果における自分のグループ。7票未満などで未クラスタなら null。
  const officialCluster = myPos >= 0 ? pts[myPos][2] : null;

  // 自分の点のライブ投影。材料が無い古い計算結果では従来どおり
  // 公式位置(myIndex)のみで表示する
  const liveSelf = projectSelf(result.projection, myVotes);

  // 自分のグループの暫定判定(ライブ)。公式ルールに合わせ、
  // マップ参加基準(通常7票)に達するまでは判定しない。
  // 30分ごとの本計算が来たら公式の割り当てで上書きされる暫定表示
  const clusterThreshold = result.thresholdUsed ?? MAP_MIN_VOTES;
  const liveCluster =
    liveSelf !== null && Object.keys(myVotes).length >= clusterThreshold
      ? nearestCluster(pts, liveSelf)
      : null;

  // 表示に使う自分のグループ。点の表示位置と整合させる:
  // ライブ投影で描いているときは暫定判定、公式位置で描いているときは公式の割り当て
  const myCluster = liveSelf !== null ? liveCluster : officialCluster;

  // ライブ投影中の自分の点が描画範囲の外に出ないよう、範囲計算に含める
  const { minX, maxX, minY, maxY } = extents(pts, liveSelf, 0.28);

  const W = 480;
  const H = 340;
  const sx = (x: number) => ((x - minX) / (maxX - minX)) * W;
  const sy = (y: number) => H - ((y - minY) / (maxY - minY)) * H;

  // 同一座標に重なる点は小さな輪状にほどいて全員を可視化する(決定的な配置)
  const displayPos = spreadCoincident(pts, sx, sy);

  // グループごとにまとめた点のパス。グループ未割当(7票未満)の参加者もグレーで
  // 描く。隠すと「N人が投票」との数のギャップが不信感につながるため、表示した
  // うえで下の凡例で意味を説明する
  const pointLayers = (() => {
    const byCluster = new Map<number, Pt[]>();
    pts.forEach((p, i) => {
      if (i === myPos) return;
      const key = p[2] ?? -1;
      const bucket = byCluster.get(key);
      if (bucket) bucket.push(displayPos[i]);
      else byCluster.set(key, [displayPos[i]]);
    });
    return [...byCluster.entries()].map(([cid, positions]) => ({
      key: cid,
      color: cid >= 0 ? GROUP_COLORS[cid % GROUP_COLORS.length] : UNCLUSTERED_COLOR,
      d: pointsPath(positions),
    }));
  })();

  // クラスタごとの点となわばり(大きいなわばりを下に描く順で返る)
  const HULL_MARGIN = 22;
  const clusters = buildClusters(pts, displayPos, HULL_MARGIN);

  // 近接クラスタのラベルが重ならないよう、縦方向に押しのける
  const LABEL_W = 90;
  const LABEL_H = 26;
  const labelPos = placeLabels(clusters, {
    width: W,
    labelW: LABEL_W,
    labelH: LABEL_H,
    hullMargin: HULL_MARGIN,
  });

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

            {/* 参加者の点(自分以外)。自分は最前面に別途描く。
                グループごとに1つのパスへ畳む(描画順は pts での初出順) */}
            {pointLayers.map(({ key, color, d }) => (
              <path key={key} d={d} fill={color} fillOpacity={0.55} pointerEvents="none" />
            ))}

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
            {(liveSelf !== null || myPos >= 0) &&
              (() => {
                const myDisplay = myPos >= 0 ? displayPos[myPos] : null;
                // 色は myCluster(表示位置と整合するグループ判定)に従う。
                // 閾値未満・判定不能の間はグレー
                const color =
                  myCluster != null ? GROUP_COLORS[myCluster % GROUP_COLORS.length] : UNCLUSTERED_COLOR;
                const pos = liveSelf ? { x: sx(liveSelf.x), y: sy(liveSelf.y) } : myDisplay;
                if (!pos) return null;
                const { x: mx, y: my } = pos;
                const chosen = placeSelfLabel(mx, my, groupLabelRects, W, H);
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
