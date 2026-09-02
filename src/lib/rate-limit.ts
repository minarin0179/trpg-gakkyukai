import { sql } from "drizzle-orm";
import { db } from "@/db";
import { RATE_LIMITS, type RateKind } from "@/lib/config";

// 上限の表は config.ts が唯一の定義(UIの案内文もそこから組み立てる)
export type { RateKind };

export async function checkAndRecordRate(
  kind: RateKind,
  actor: string,
  maxOverride?: number,
  context?: string,
): Promise<{ ok: boolean; remaining: number }> {
  const limit = RATE_LIMITS[kind];
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
