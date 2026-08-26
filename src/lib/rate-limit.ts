import { and, eq, gt, count } from "drizzle-orm";
import { db, rateEvents } from "@/db";

const LIMITS: Record<string, { max: number; windowMs: number }> = {
  // 内容ではなく流量で制御する(無審査設計の前提となる対策)
  theme_create: { max: 3, windowMs: 24 * 60 * 60 * 1000 },
  statement_create: { max: 30, windowMs: 24 * 60 * 60 * 1000 },
};

export async function checkAndRecordRate(
  kind: "theme_create" | "statement_create",
  actor: string,
): Promise<{ ok: boolean; remaining: number }> {
  const limit = LIMITS[kind];
  const since = new Date(Date.now() - limit.windowMs);
  const [row] = await db
    .select({ n: count() })
    .from(rateEvents)
    .where(
      and(eq(rateEvents.kind, kind), eq(rateEvents.actorHash, actor), gt(rateEvents.createdAt, since)),
    );
  const used = row?.n ?? 0;
  if (used >= limit.max) {
    return { ok: false, remaining: 0 };
  }
  await db.insert(rateEvents).values({ kind, actorHash: actor });
  return { ok: true, remaining: limit.max - used - 1 };
}
