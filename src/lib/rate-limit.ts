import { sql } from "drizzle-orm";
import { db } from "@/db";

const DAY = 24 * 60 * 60 * 1000;

// 内容ではなく流量で制御する(無審査設計の前提となる対策)。
// *_ip はCGNAT(モバイル回線等で多人数が同一IPを共有)を考慮し、
// cookie側の上限より大幅に緩くして正規ユーザーの巻き添えを防ぐ
const LIMITS: Record<string, { max: number; windowMs: number }> = {
  theme_create: { max: 3, windowMs: DAY },
  statement_create: { max: 30, windowMs: DAY },
  statement_create_ip: { max: 100, windowMs: DAY },
  report_create: { max: 20, windowMs: DAY },
  // 投票(IP×テーマ単位)。上限はテーマの意見数に比例するため、
  // 呼び出し側が maxOverride で渡す。max: 0 は「渡し忘れたら常に拒否」の安全側の既定
  vote_ip_theme: { max: 0, windowMs: DAY },
  // 類似テーマのライブチェック(入力デバウンスごとに1回)。埋め込み計算の乱用防止
  similar_check: { max: 300, windowMs: DAY },
  // テーマ検索の意味検索(検索1回につき1回)。超過時は部分一致のみに縮退する
  search_embed: { max: 300, windowMs: DAY },
  // タグ付与(cookie/IPの二重計数)
  tag_add: { max: 30, windowMs: DAY },
  tag_add_ip: { max: 100, windowMs: DAY },
};

export async function checkAndRecordRate(
  kind:
    | "theme_create"
    | "statement_create"
    | "statement_create_ip"
    | "report_create"
    | "vote_ip_theme"
    | "similar_check"
    | "search_embed"
    | "tag_add"
    | "tag_add_ip",
  actor: string,
  maxOverride?: number,
  context?: string,
): Promise<{ ok: boolean; remaining: number }> {
  const limit = LIMITS[kind];
  const max = maxOverride ?? limit.max;
  const since = new Date(Date.now() - limit.windowMs);

  // 判定と記録を1文にして往復を減らし、並列送信で上限を超えられないようにする(S-8)。
  // SELECTとINSERTを分けると、同時に届いた複数リクエストが全て「まだ枠がある」と
  // 判定してから記録するため、上限を素通りできてしまう。
  // なお1文でも件数と挿入は同じスナップショットを見るため、ほぼ同時に始まった
  // トランザクション同士は互いの挿入が見えず、少しだけ上限を超えられる
  // (実測: 上限3に5並列で3〜4件挿入)。すき間がSELECT→INSERTの往復から
  // 1文の実行時間まで縮むので実用上は十分で、流量制御が目的なのでこのずれは許容する
  const { rows } = await db.execute<{ used: number; inserted: number }>(sql`
    WITH used AS (
      SELECT count(*)::int AS n FROM rate_events
      WHERE kind = ${kind} AND actor_hash = ${actor} AND created_at > ${since}
    ), ins AS (
      INSERT INTO rate_events (kind, actor_hash)
      SELECT ${kind}, ${actor} FROM used WHERE used.n < ${max}
      RETURNING id
    )
    SELECT used.n AS used, (SELECT count(*)::int FROM ins) AS inserted FROM used
  `);
  const used = Number(rows[0]?.used ?? 0);
  const ok = Number(rows[0]?.inserted ?? 0) > 0;
  if (!ok) {
    // 誤検知(正規ユーザーの巻き添え)の監視用。Vercelのランタイムログで確認する
    console.warn(
      `rate limit exceeded: kind=${kind} max=${max}${context ? ` context=${context}` : ""}`,
    );
    return { ok: false, remaining: 0 };
  }
  return { ok: true, remaining: max - used - 1 };
}
