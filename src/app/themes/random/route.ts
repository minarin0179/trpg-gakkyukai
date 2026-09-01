import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db, themes } from "@/db";

// アクティブなテーマからランダムに1つ選んで開く(要望#4575)。
// 毎回結果が変わるためキャッシュ不可の動的ルート
export const dynamic = "force-dynamic";

export async function GET() {
  const [t] = await db
    .select({ id: themes.id })
    .from(themes)
    .where(eq(themes.status, "active"))
    .orderBy(sql`random()`)
    .limit(1);
  redirect(t ? `/t/${t.id}` : "/themes");
}
