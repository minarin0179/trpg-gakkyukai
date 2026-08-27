import { and, eq } from "drizzle-orm";
import { db, statements, votes, mathResults } from "@/db";
import { getThemeCounts, getMathResult } from "./queries";
import { RECOMPUTE_MIN_INTERVAL_SEC } from "./config";

// 保存するJSONの形。pidMap(参加者UUID→行列インデックス)はサーバー内部専用で、
// クライアントに渡す前に必ず取り除くこと(UUIDは参加者の身元そのもの)
export type MathResultJson = {
  status: "ok" | "insufficient";
  reason?: string;
  threshold_used?: number;
  group_count?: number;
  participants?: { id: number; x: number; y: number; cluster: number | null }[];
  consensus?: {
    agree: { statement_id: number; agree_ratio: number | null }[];
    disagree: { statement_id: number; agree_ratio: number | null }[];
  };
  repness?: Record<string, { statement_id: number; repful_for: string }[]>;
  pidMap?: Record<string, number>;
};

function computeEndpoint(): string {
  if (process.env.COMPUTE_URL) return process.env.COMPUTE_URL; // ローカル開発用
  // デプロイ固有URL(VERCEL_URL)はVercelの保護で401になるため、公開されている
  // 本番エイリアスを使う。計算エンドポイントはステートレスなので、
  // プレビュー環境から本番の関数を呼んでも結果は変わらない
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (host) return `https://${host}/api/compute`;
  throw new Error("COMPUTE_URL or VERCEL_PROJECT_PRODUCTION_URL must be set");
}

export async function recomputeTheme(themeId: string): Promise<void> {
  // computedAt は「投票を読み込む前」の時刻にする。計算(fetch往復)中に入った票の
  // updatedAt が computedAt より前になって恒久的に取りこぼされるのを防ぐ
  // (次サイクルで lastVoteAt > computedAt となり拾える)。
  const startedAt = new Date();

  const allVotes = await db
    .select({
      participantId: votes.participantId,
      statementId: votes.statementId,
      value: votes.value,
      updatedAt: votes.updatedAt,
    })
    .from(votes)
    .where(eq(votes.themeId, themeId));

  const visible = await db
    .select({ id: statements.id })
    .from(statements)
    .where(and(eq(statements.themeId, themeId), eq(statements.status, "visible")));
  const visibleIds = new Set(visible.map((s) => s.id));

  // 参加者UUIDを行列用の連番に変換(初回投票順で安定させる)
  const pidMap: Record<string, number> = {};
  let nextIndex = 0;
  for (const v of allVotes) {
    if (!(v.participantId in pidMap)) pidMap[v.participantId] = nextIndex++;
  }

  const payload = {
    votes: allVotes
      .filter((v) => visibleIds.has(v.statementId))
      .map((v) => ({
        participant_id: pidMap[v.participantId],
        statement_id: v.statementId,
        vote: v.value,
        modified: Math.floor(v.updatedAt.getTime() / 1000),
      })),
    statement_count: visibleIds.size,
    mod_out_statement_ids: [],
  };

  const res = await fetch(computeEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Key": process.env.CRON_SECRET ?? "",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`compute failed: ${res.status} ${await res.text()}`);
  }
  const result = (await res.json()) as MathResultJson;
  result.pidMap = pidMap;

  await db
    .insert(mathResults)
    .values({
      themeId,
      voteCount: payload.votes.length,
      result,
      computedAt: startedAt,
    })
    .onConflictDoUpdate({
      target: mathResults.themeId,
      set: { voteCount: payload.votes.length, result, computedAt: startedAt },
    });
}

// 投票のたびに呼ばれる。実際に再計算するのは「前回計算以降に投票の追加・変更があり、
// 前回計算から一定時間経過している」場合のみ
export async function maybeRecompute(themeId: string): Promise<boolean> {
  const [counts, existing] = await Promise.all([
    getThemeCounts(themeId),
    getMathResult(themeId),
  ]);
  if (existing) {
    const ageSec = (Date.now() - existing.computedAt.getTime()) / 1000;
    // 前回計算以降に投票の追加・変更(訂正)が無ければスキップ。
    // 票数だけでなく最終更新時刻で見るので、値の訂正でも再計算される。
    const lastVoteAt = counts.lastVoteAt ? new Date(counts.lastVoteAt) : null;
    if (!lastVoteAt || lastVoteAt <= existing.computedAt) return false;
    if (ageSec < RECOMPUTE_MIN_INTERVAL_SEC) return false;
  }
  try {
    await recomputeTheme(themeId);
    return true;
  } catch (e) {
    console.error(`recompute failed for theme ${themeId}:`, e);
    return false;
  }
}
