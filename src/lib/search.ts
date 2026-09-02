// 検索のうち「リクエストに依存する処理」を担う層。
// 埋め込みAPIの呼び出しは重いので headers() から取ったIPでレート制限をかける。
// クエリ層(queries/**)は headers() に触れないよう、この判定はここに置く
import { and, cosineDistance, desc, eq, isNotNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db, themes } from "@/db";
import { embedTexts } from "./embedding";
import { checkAndRecordRate } from "./rate-limit";
import { dailyActorHash } from "./participant";
import { SEARCH_SIMILAR_THRESHOLD, SEARCH_SEMANTIC_MAX } from "./config";

// 意味検索: 検索語を埋め込み、類似度が閾値以上のテーマIDを関連度順で返す。
// 埋め込み不可・レート超過・失敗時は空配列(部分一致のみに縮退し、検索は止めない)
export async function semanticThemeIds(query: string): Promise<string[]> {
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rate = await checkAndRecordRate("search_embed", dailyActorHash(`ip:${ip}`));
    if (!rate.ok) return [];
    const vec = (await embedTexts([query]))?.[0];
    if (!vec) return [];
    const sim = sql<number>`1 - (${cosineDistance(themes.embedding, vec)})`;
    const near = await db
      .select({ id: themes.id, sim })
      .from(themes)
      .where(and(eq(themes.status, "active"), isNotNull(themes.embedding)))
      .orderBy(desc(sim))
      .limit(SEARCH_SEMANTIC_MAX);
    return near.filter((r) => Number(r.sim) >= SEARCH_SIMILAR_THRESHOLD).map((r) => r.id);
  } catch (e) {
    console.error("semantic search failed:", e);
    return [];
  }
}
