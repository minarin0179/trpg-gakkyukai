import { and, eq, sql } from "drizzle-orm";
import { db, statements, votes, mathResults } from "@/db";
import { isMathResultJson, type RepnessItem } from "../math-result";
import { getMathResult } from "./theme";

// 結果レポート用の公開集計(意見ごと・グループごとの賛否)

// 結果ページ用: 意見ごとの投票内訳(賛成/反対/パス)。全員に同じ内容の公開集計
export async function getStatementVoteStats(themeId: string) {
  return db
    .select({
      id: statements.id,
      text: statements.text,
      agree: sql<number>`count(*) filter (where ${votes.value} = 1)::int`,
      disagree: sql<number>`count(*) filter (where ${votes.value} = -1)::int`,
      pass: sql<number>`count(*) filter (where ${votes.value} = 0)::int`,
    })
    .from(statements)
    // themeIdも結合条件に入れる(多重防御。他テーマ名義で入った票を集計に混ぜない)
    .leftJoin(votes, and(eq(votes.statementId, statements.id), eq(votes.themeId, themeId)))
    .where(and(eq(statements.themeId, themeId), eq(statements.status, "visible")))
    .groupBy(statements.id, statements.text)
    .orderBy(statements.id);
}

// 結果ページ用のグループ別集計(本家Polisレポートの機械集計に相当)。
// 保存済み計算結果のクラスタ割当(pidMap+participants)と票を突き合わせて、
// 意見ごと・グループごとの賛否パスを数える。計算結果が無い/不成立なら null
export type GroupVoteCounts = { agree: number; disagree: number; pass: number };
export type GroupBreakdown = {
  groupCount: number;
  groupSizes: number[]; // 添字 = グループ(クラスタ)ID
  byStatement: Record<number, GroupVoteCounts[]>; // 意見ID → グループごとの内訳
  repness: Record<string, RepnessItem[]>;
  consensus: { agree: number[]; disagree: number[] };
  // 意見の散布図用: 意見ID → 主成分負荷(pc1, pc2)。古い計算結果には無い
  statementXY: Record<number, [number, number]>;
  // グループごとの参加者重心の方向(意見コンパスの向きラベル用)。添字 = グループID
  groupDirections: [number, number][];
  computedAt: Date;
};

export async function getGroupVoteBreakdown(
  themeId: string,
  // 呼び出し側が計算結果の行を既に持っている場合に渡す(大きなJSONBの二重取得を避ける)
  preloaded?: Awaited<ReturnType<typeof getMathResult>>,
): Promise<GroupBreakdown | null> {
  const row = preloaded ?? (await getMathResult(themeId));
  if (!row) return null;
  // jsonbの中身は型では保証されないので、使う前に形を確かめる
  const result = row.result;
  if (!isMathResultJson(result)) return null;
  if (result.status !== "ok" || !result.participants || !result.pidMap) return null;

  // 行列インデックス → クラスタ、参加者UUID → クラスタの順に引けるようにする
  const clusterByIndex = new Map<number, number>();
  for (const p of result.participants) {
    if (p.cluster !== null && p.cluster !== undefined) clusterByIndex.set(p.id, p.cluster);
  }
  const clusterOf = new Map<string, number>();
  for (const [uuid, idx] of Object.entries(result.pidMap)) {
    const cluster = clusterByIndex.get(idx);
    if (cluster !== undefined) clusterOf.set(uuid, cluster);
  }
  const groupCount = new Set(clusterByIndex.values()).size;
  if (groupCount < 2) return null;

  const groupSizes: number[] = Array.from({ length: groupCount }, () => 0);
  for (const cluster of clusterOf.values()) groupSizes[cluster] = (groupSizes[cluster] ?? 0) + 1;

  // 集計はDB側で行う(票を生で全件転送するとホットなテーマで1回数MBになるため)。
  // 参加者→グループの対応は保存済みJSONの pidMap と participants をSQL内で展開して作る
  const aggregated = await db.execute(sql`
    with pid_map as (
      select kv.key as participant_id, kv.value::int as idx
      from ${mathResults}, jsonb_each_text(result->'pidMap') as kv
      where theme_id = ${themeId}
    ),
    clusters as (
      select (p->>'id')::int as idx, (p->>'cluster')::int as cluster
      from ${mathResults}, jsonb_array_elements(result->'participants') as p
      where theme_id = ${themeId} and p->>'cluster' is not null
    ),
    member as (
      select pid_map.participant_id, clusters.cluster from pid_map join clusters using (idx)
    )
    select v.statement_id as sid, m.cluster,
      count(*) filter (where v.value = 1)::int as agree,
      count(*) filter (where v.value = -1)::int as disagree,
      count(*) filter (where v.value = 0)::int as pass
    from ${votes} v join member m on m.participant_id = v.participant_id
    where v.theme_id = ${themeId}
    group by v.statement_id, m.cluster
  `);

  const byStatement: Record<number, GroupVoteCounts[]> = {};
  for (const row of aggregated.rows as {
    sid: number;
    cluster: number;
    agree: number;
    disagree: number;
    pass: number;
  }[]) {
    const rows = (byStatement[row.sid] ??= Array.from({ length: groupCount }, () => ({
      agree: 0,
      disagree: 0,
      pass: 0,
    })));
    if (row.cluster >= 0 && row.cluster < groupCount) {
      rows[row.cluster] = { agree: row.agree, disagree: row.disagree, pass: row.pass };
    }
  }

  const statementXY: Record<number, [number, number]> = {};
  for (const [sid, arr] of Object.entries(result.projection?.statements ?? {})) {
    statementXY[Number(sid)] = [arr[0], arr[1]];
  }
  const centroids = Array.from({ length: groupCount }, () => ({ x: 0, y: 0, n: 0 }));
  for (const p of result.participants) {
    if (p.cluster === null || p.cluster === undefined) continue;
    const c = centroids[p.cluster];
    if (!c) continue;
    c.x += p.x;
    c.y += p.y;
    c.n++;
  }
  const groupDirections = centroids.map(
    (c): [number, number] => (c.n > 0 ? [c.x / c.n, c.y / c.n] : [0, 0]),
  );

  return {
    groupCount,
    groupSizes,
    byStatement,
    statementXY,
    groupDirections,
    repness: result.repness ?? {},
    consensus: {
      agree: (result.consensus?.agree ?? []).map((c) => c.statement_id),
      disagree: (result.consensus?.disagree ?? []).map((c) => c.statement_id),
    },
    computedAt: row.computedAt,
  };
}
