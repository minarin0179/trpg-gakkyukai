// 投票デッキの提示順を決める抽選。UIから切り離した純関数
// (Reactに依存しないのでそのままテストできる)。

// 抽選の対象。priorityはidで引くので、必要なのはidだけ
type Identified = { id: number };

// 偏りを避けるためのFisher-Yatesシャッフル(元のサーバー側 random() 相当)
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 計算結果に載っていない意見(直近の投稿で票がまだ無い等)の既定priority。
// 本家の式で0票・極性0の意見が持つ値: (0.5×0.5×1 × 9)² ≈ 5.06
export const DEFAULT_PRIORITY = 5.06;

// priorityに比例した重み付き抽選(非復元)。本家Polisのcomment routingと同じく、
// 決定的なソートではなく抽選にすることで全員が同一順で見ることによる偏りを避ける。
// rngは差し替え可能にしてある(テストで再現性を持たせるため。既定は Math.random)
export function weightedShuffle<T extends Identified>(
  items: T[],
  priorities: Record<string, number> | null,
  rng: () => number = Math.random,
): T[] {
  if (!priorities) return shuffle(items, rng);
  const pool = items.map((s) => ({
    s,
    w: Math.max(priorities[s.id] ?? DEFAULT_PRIORITY, 0.01),
  }));
  const out: T[] = [];
  while (pool.length > 0) {
    let r = rng() * pool.reduce((sum, p) => sum + p.w, 0);
    let idx = 0;
    for (; idx < pool.length - 1; idx++) {
      r -= pool[idx].w;
      if (r <= 0) break;
    }
    out.push(pool[idx].s);
    pool.splice(idx, 1);
  }
  return out;
}
