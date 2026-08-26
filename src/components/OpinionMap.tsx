"use client";

// red-dwarfの計算結果を2D散布図として描画する。
// 点は匿名参加者。クラスタ(意見グループ)ごとに色分けし、閲覧者自身を強調表示する。

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

export function OpinionMap({
  result,
  myIndex,
  statementTexts,
}: {
  result: PublicMathResult | null;
  myIndex: number | null;
  statementTexts: Record<number, string>;
}) {
  if (!result || result.status !== "ok" || !result.participants?.length) {
    return (
      <p className="rounded-lg border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
        意見マップはまだありません。もう少し投票が集まると、意見グループの地図がここに描かれます。
      </p>
    );
  }

  const pts = result.participants;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const pad = 0.15;
  const spanX = Math.max(Math.max(...xs) - Math.min(...xs), 0.01);
  const spanY = Math.max(Math.max(...ys) - Math.min(...ys), 0.01);
  const minX = Math.min(...xs) - spanX * pad;
  const maxX = Math.max(...xs) + spanX * pad;
  const minY = Math.min(...ys) - spanY * pad;
  const maxY = Math.max(...ys) + spanY * pad;

  const W = 480;
  const H = 320;
  const sx = (x: number) => ((x - minX) / (maxX - minX)) * W;
  const sy = (y: number) => H - ((y - minY) / (maxY - minY)) * H;

  const clusters = new Map<number, number>();
  for (const p of pts) {
    if (p.cluster !== null) clusters.set(p.cluster, (clusters.get(p.cluster) ?? 0) + 1);
  }

  const consensusAgree = (result.consensus?.agree ?? []).filter(
    (c) => statementTexts[c.statement_id],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white p-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto w-full max-w-lg" role="img" aria-label="意見マップ">
          {pts.map((p) => {
            const isMe = myIndex !== null && p.id === myIndex;
            const color = p.cluster !== null ? GROUP_COLORS[p.cluster % GROUP_COLORS.length] : "#a8a29e";
            return (
              <g key={p.id}>
                <circle
                  cx={sx(p.x)}
                  cy={sy(p.y)}
                  r={isMe ? 7 : 4.5}
                  fill={color}
                  fillOpacity={isMe ? 1 : 0.55}
                  stroke={isMe ? "#1c1917" : "none"}
                  strokeWidth={isMe ? 2 : 0}
                />
                {isMe && (
                  <text x={sx(p.x) + 10} y={sy(p.y) + 4} fontSize="11" fill="#1c1917" fontWeight="bold">
                    あなた
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs text-stone-600">
          {[...clusters.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([cid, n]) => (
              <span key={cid} className="inline-flex items-center gap-1">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: GROUP_COLORS[cid % GROUP_COLORS.length] }}
                />
                グループ{GROUP_NAMES[cid] ?? cid}({n}人)
              </span>
            ))}
          <span className="text-stone-400">近くにいる人ほど投票傾向が似ています</span>
        </div>
      </div>

      {consensusAgree.length > 0 && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <h3 className="mb-2 text-sm font-semibold text-emerald-900">
            🤝 グループを越えて合意された意見
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
            const visible = items.filter((i) => statementTexts[i.statement_id]).slice(0, 3);
            if (visible.length === 0) return null;
            const g = Number(gid);
            return (
              <div key={gid} className="rounded-lg border border-stone-200 bg-white p-4">
                <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: GROUP_COLORS[g % GROUP_COLORS.length] }}
                  />
                  グループ{GROUP_NAMES[g] ?? g}の特徴的な意見
                </h4>
                <ul className="flex flex-col gap-1.5 text-sm text-stone-700">
                  {visible.map((i) => (
                    <li key={i.statement_id}>
                      「{statementTexts[i.statement_id]}」
                      <span className="ml-1 text-xs text-stone-500">
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
