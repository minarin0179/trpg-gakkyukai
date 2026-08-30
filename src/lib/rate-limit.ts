import { and, eq, gt, count } from "drizzle-orm";
import { db, rateEvents } from "@/db";

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
};

export async function checkAndRecordRate(
  kind:
    | "theme_create"
    | "statement_create"
    | "statement_create_ip"
    | "report_create"
    | "vote_ip_theme"
    | "similar_check"
    | "search_embed",
  actor: string,
  maxOverride?: number,
  context?: string,
): Promise<{ ok: boolean; remaining: number }> {
  const limit = LIMITS[kind];
  const max = maxOverride ?? limit.max;
  const since = new Date(Date.now() - limit.windowMs);
  const [row] = await db
    .select({ n: count() })
    .from(rateEvents)
    .where(
      and(eq(rateEvents.kind, kind), eq(rateEvents.actorHash, actor), gt(rateEvents.createdAt, since)),
    );
  const used = row?.n ?? 0;
  if (used >= max) {
    // 誤検知(正規ユーザーの巻き添え)の監視用。Vercelのランタイムログで確認する
    console.warn(
      `rate limit exceeded: kind=${kind} max=${max}${context ? ` context=${context}` : ""}`,
    );
    return { ok: false, remaining: 0 };
  }
  await db.insert(rateEvents).values({ kind, actorHash: actor });
  return { ok: true, remaining: max - used - 1 };
}
