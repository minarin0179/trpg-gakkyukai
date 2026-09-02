import { getCache } from "@vercel/functions";
import { and, eq } from "drizzle-orm";
import { revalidateTheme } from "./revalidate";
import { internalApiKey } from "./env";
import { db, statements, votes, mathResults } from "@/db";
import { getThemeCounts, getMathResultMeta } from "./queries";
import { RECOMPUTE_MIN_INTERVAL_SEC } from "./config";
import { isMathResultJson, type MathResultJson } from "./math-result";

// 型は math-result.ts に集約した。既存のimport互換のためここからも再輸出する
export type { MathResultJson } from "./math-result";

// 再計算に失敗したことを短時間だけ覚えておくキー。
// 失敗しても computedAt が進まないため、次の投票で30分ごとに全票を読み直して
// 失敗を繰り返していた(1テーマ分の全投票=転送量最大の処理)。
// Runtime Cache はリージョンごと・ベストエフォートなので、使えない環境
// (ローカル開発など)では黙って従来どおりの挙動に落ちる
const BACKOFF_NAMESPACE = "recompute";
const backoffKey = (themeId: string) => `recompute-backoff:${themeId}`;

async function markRecomputeFailure(themeId: string): Promise<void> {
  try {
    await getCache({ namespace: BACKOFF_NAMESPACE }).set(backoffKey(themeId), 1, {
      ttl: RECOMPUTE_MIN_INTERVAL_SEC,
    });
  } catch {
    // キャッシュが使えなければ抑制しないだけ(挙動は従来と同じ)
  }
}

async function isBackingOff(themeId: string): Promise<boolean> {
  try {
    return (await getCache({ namespace: BACKOFF_NAMESPACE }).get(backoffKey(themeId))) != null;
  } catch {
    return false;
  }
}

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

  // 票はタプル([participant_id, statement_id, vote, modified])で送る。
  // キー名の反復が票数ぶん載るとリクエストが数MB規模になるため。
  // 受け側(api/_logic.py)は votes_t を先に見る(旧形式の votes も引き続き受ける)。
  // 注意: 計算関数は本番エイリアス固定で呼ぶため(computeEndpoint)、
  // votes_t 対応の api/_logic.py が本番に出るまではプレビューからの再計算が失敗する
  const payload = {
    votes_t: allVotes
      .filter((v) => visibleIds.has(v.statementId))
      .map(
        (v) =>
          [
            pidMap[v.participantId],
            v.statementId,
            v.value,
            Math.floor(v.updatedAt.getTime() / 1000),
          ] as const,
      ),
    statement_count: visibleIds.size,
    mod_out_statement_ids: [],
  };
  const body = JSON.stringify(payload);
  // 転送量の実測値をログに残す(1テーマ1行)。数値とカンマだけなので長さ=バイト数
  console.log(
    `recompute payload theme=${themeId} votes=${payload.votes_t.length} bytes=${body.length}`,
  );

  // 計算関数がハングしても呼び出し側(同期実行するページ含む)を止めないようタイムアウトを設ける
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  let res: Response;
  try {
    res = await fetch(computeEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": internalApiKey(),
      },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    throw new Error(`compute failed: ${res.status} ${await res.text()}`);
  }
  // 計算関数の応答は外部入力と同じ扱いにする。想定外の形をそのまま保存すると
  // 読み出し側(ページ)で壊れるため、ここで弾いて前回の結果を残す
  const parsed: unknown = await res.json();
  if (!isMathResultJson(parsed)) {
    throw new Error("compute returned an unexpected shape");
  }
  const result: MathResultJson = parsed;
  result.pidMap = pidMap;

  await db
    .insert(mathResults)
    .values({
      themeId,
      voteCount: payload.votes_t.length,
      result,
      computedAt: startedAt,
    })
    .onConflictDoUpdate({
      target: mathResults.themeId,
      set: { voteCount: payload.votes_t.length, result, computedAt: startedAt },
    });

  // 新しいマップを30分のISRキャッシュを待たずページに反映する。
  // after()やcronなど呼び出し文脈によっては失敗し得るため、失敗しても
  // 計算結果自体は保存済みとし、ページ側の時間ベース再生成に委ねる
  try {
    revalidateTheme(themeId);
  } catch {
    // noop
  }
}

// 投票のたびに呼ばれる。実際に再計算するのは「前回計算以降に投票の追加・変更があり、
// 前回計算から一定時間経過している」場合のみ。
// 判定は安い順に行う: まず前回計算のメタ情報(小さな1行)だけを見て、
// 間隔が空いていなければ即スキップする。大多数の投票はここで終わるので、
// 1票あたりのコストは軽いクエリ1本で済み、票の集計(全票走査)まで行かない
export async function maybeRecompute(themeId: string): Promise<boolean> {
  // 直近の失敗を覚えている間は何もしない。DBを触らない一番安いチェックなので先に置く
  if (await isBackingOff(themeId)) return false;

  const existing = await getMathResultMeta(themeId);
  if (existing) {
    const ageSec = (Date.now() - existing.computedAt.getTime()) / 1000;
    if (ageSec < RECOMPUTE_MIN_INTERVAL_SEC) return false;
    // 前回計算以降に投票の追加・変更(訂正)が無ければスキップ。
    // 票数だけでなく最終更新時刻で見るので、値の訂正でも再計算される。
    const counts = await getThemeCounts(themeId);
    const lastVoteAt = counts.lastVoteAt ? new Date(counts.lastVoteAt) : null;
    if (!lastVoteAt || lastVoteAt <= existing.computedAt) return false;
  }
  try {
    await recomputeTheme(themeId);
    return true;
  } catch (e) {
    // 失敗(非2xx・タイムアウト・想定外の応答)を記録し、次の投票での即再試行を止める
    console.error(`recompute failed for theme ${themeId}:`, e);
    await markRecomputeFailure(themeId);
    return false;
  }
}
