// 意見マップ(散布図)の幾何計算。Reactに依存しない純関数として切り出し、
// OpinionMap.tsx は状態・ホバー・SVGの組み立てに専念できるようにする。
// 描画結果が変わらないことが前提なので、演算・反復順・同点時の扱いは変えないこと
import type { PublicMathResult } from "./math-result";

export type Pt = { x: number; y: number };

// 計算結果に入っている参加者の点(idは行列インデックス)
export type MapPoint = NonNullable<PublicMathResult["participants"]>[number];

// クラスタ(意見グループ)ごとの表示情報。membersは画面座標の点
export type Cluster = { cid: number; members: Pt[]; hull: Pt[]; cx: number; cy: number };

// ラベルの矩形(重なり判定用)
export type LabelBox = { x0: number; y0: number; x1: number; y1: number };

// 「あなた」ラベルの置き場所(テキストのアンカーと位置、および占有矩形)
export type SelfLabel = LabelBox & {
  anchor: "start" | "end" | "middle";
  tx: number;
  ty: number;
};

// 自分の点のライブ投影(本家Polisと同じ方式)。公開されているPCAの軸(意見ごとの
// 成分と平均)に自分の投票を掛けるだけなので、再計算やリロードを待たずに
// 投票のたびに自分の点がすぐ動く。材料が無い古い計算結果では null を返す
export function projectSelf(
  projection: PublicMathResult["projection"],
  myVotes: Record<number, number>,
): Pt | null {
  const proj = projection;
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
      return { x: lx * scale, y: ly * scale };
    }
  }
  return null;
}

// 自分のグループの暫定判定(ライブ)。本計算のグループ分けはk-means
// (=「最も近い重心」への割り当て)なので、公開されている各グループの
// 重心に対して同じ規則を適用すれば、公式の境界の引き方を再現できる。
// 呼び出し側で「マップ参加基準(通常7票)に達したか」を確かめてから使う
export function nearestCluster(pts: MapPoint[], self: Pt): number | null {
  let nearest: number | null = null;
  const acc = new Map<number, { x: number; y: number; n: number }>();
  for (const p of pts) {
    if (p.cluster === null) continue;
    const a = acc.get(p.cluster) ?? { x: 0, y: 0, n: 0 };
    acc.set(p.cluster, { x: a.x + p.x, y: a.y + p.y, n: a.n + 1 });
  }
  let best = Infinity;
  for (const [cid, a] of acc) {
    const d = Math.hypot(self.x - a.x / a.n, self.y - a.y / a.n);
    if (d < best) {
      best = d;
      nearest = cid;
    }
  }
  return nearest;
}

// 描画範囲(余白込み)。ライブ投影中の自分の点も範囲に含める。
// 参加者数が多いと Math.min(...xs) は引数の数の上限で落ちるため、走査で求める
export function extents(
  pts: MapPoint[],
  self: Pt | null,
  pad: number,
): { minX: number; maxX: number; minY: number; maxY: number } {
  let lowX = Infinity;
  let highX = -Infinity;
  let lowY = Infinity;
  let highY = -Infinity;
  const consider = (x: number, y: number) => {
    if (x < lowX) lowX = x;
    if (x > highX) highX = x;
    if (y < lowY) lowY = y;
    if (y > highY) highY = y;
  };
  for (const p of pts) consider(p.x, p.y);
  if (self) consider(self.x, self.y);
  const spanX = Math.max(highX - lowX, 0.01);
  const spanY = Math.max(highY - lowY, 0.01);
  return {
    minX: lowX - spanX * pad,
    maxX: highX + spanX * pad,
    minY: lowY - spanY * pad,
    maxY: highY + spanY * pad,
  };
}

// 完全に同じ投票をした参加者は数学的に同一座標になり、点が1つにしか見えない。
// 同一座標の点は小さな輪状にほどいて全員を可視化する(半透明の重なりが密度表現になる)。
// 乱数でなくインデックス順の決定的な配置にし、再描画で位置が揺れないようにする
export function spreadCoincident(
  pts: MapPoint[],
  sx: (x: number) => number,
  sy: (y: number) => number,
): Map<number, Pt> {
  const displayPos = new Map<number, Pt>();
  const byPos = new Map<string, MapPoint[]>();
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
  return displayPos;
}

// Andrewのmonotone chainによる凸包
export function convexHull(points: Pt[]): Pt[] {
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
export function expandHull(hull: Pt[], padding: number): Pt[] {
  const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length;
  const cy = hull.reduce((s, p) => s + p.y, 0) / hull.length;
  return hull.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * padding, y: p.y + (dy / len) * padding };
  });
}

// クラスタごとの点となわばり。大きいなわばりを下に描くため人数の降順で返す
export function buildClusters(
  pts: MapPoint[],
  displayPos: Map<number, Pt>,
  hullMargin: number,
): Cluster[] {
  const clusterMap = new Map<number, Pt[]>();
  for (const p of pts) {
    if (p.cluster === null) continue;
    if (!clusterMap.has(p.cluster)) clusterMap.set(p.cluster, []);
    clusterMap.get(p.cluster)!.push(displayPos.get(p.id)!);
  }
  return [...clusterMap.entries()]
    .map(([cid, members]) => {
      const hull = expandHull(convexHull(members), hullMargin);
      const cx = members.reduce((s, p) => s + p.x, 0) / members.length;
      const cy = members.reduce((s, p) => s + p.y, 0) / members.length;
      return { cid, members, hull, cx, cy };
    })
    .sort((a, b) => b.members.length - a.members.length);
}

// 近接クラスタのラベルが重ならないよう、縦方向に押しのける
export function placeLabels(
  clusters: Cluster[],
  opts: { width: number; labelW: number; labelH: number; hullMargin: number },
): Map<number, { cx: number; cy: number }> {
  const { width: W, labelW: LABEL_W, labelH: LABEL_H, hullMargin: HULL_MARGIN } = opts;
  // ラベルは重心ではなく「なわばり上端の点のない帯」(凸包はHULL_MARGINぶん外側に
  // 押し広げてあるので、その帯に点は無い)に置き、密集した中心部の点を覆わないようにする
  const labelAnchorY = (c: Cluster): number => {
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
  return new Map(placed.map((p) => [p.cid, { cx: p.cx, cy: p.cy }]));
}

// 「あなた」ラベルの置き場所。点の右→左→上→下の順に、グループラベルと
// 重ならず画面内に収まる位置を選ぶ(どれも駄目なら最初の候補)
export function placeSelfLabel(
  mx: number,
  my: number,
  groupLabelRects: LabelBox[],
  width: number,
  height: number,
): SelfLabel {
  const W = width;
  const H = height;
  const TW = 34; // 「あなた」の概算幅
  const HH = 8; // テキスト矩形の半高
  const candidates: SelfLabel[] = [
    { anchor: "start" as const, tx: mx + 11, ty: my + 4, x0: mx + 9, y0: my - HH, x1: mx + 11 + TW, y1: my + HH },
    { anchor: "end" as const, tx: mx - 11, ty: my + 4, x0: mx - 11 - TW, y0: my - HH, x1: mx - 9, y1: my + HH },
    { anchor: "middle" as const, tx: mx, ty: my - 12, x0: mx - TW / 2, y0: my - 22, x1: mx + TW / 2, y1: my - 8 },
    { anchor: "middle" as const, tx: mx, ty: my + 18, x0: mx - TW / 2, y0: my + 8, x1: mx + TW / 2, y1: my + 22 },
  ];
  const overlaps = (c: SelfLabel, g: LabelBox) =>
    c.x0 < g.x1 && c.x1 > g.x0 && c.y0 < g.y1 && c.y1 > g.y0;
  const inBounds = (c: SelfLabel) => c.x0 >= 0 && c.x1 <= W && c.y0 >= 0 && c.y1 <= H;
  return (
    candidates.find((c) => inBounds(c) && !groupLabelRects.some((g) => overlaps(c, g))) ??
    candidates.find((c) => inBounds(c)) ??
    candidates[0]
  );
}
