import { NextResponse } from "next/server";
import { eq, lt, isNotNull } from "drizzle-orm";
import { db, themes, rateEvents, reports } from "@/db";
import { maybeRecompute, recomputeTheme } from "@/lib/recompute";

// 日次のバックストップ再計算。通常は投票時に都度再計算されるため、
// これは取りこぼし(計算失敗など)の回収用
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ?force=1 で、投票数の増減に関わらず全アクティブテーマを再計算する。
  // 計算ロジック(_logic.py 等)を変更した後にキャッシュを一括更新する用途。
  const force = new URL(request.url).searchParams.get("force") === "1";

  const active = await db
    .select({ id: themes.id })
    .from(themes)
    .where(eq(themes.status, "active"));

  let recomputed = 0;
  for (const t of active) {
    if (force) {
      try {
        await recomputeTheme(t.id);
        recomputed++;
      } catch (e) {
        console.error(`forced recompute failed for theme ${t.id}:`, e);
      }
    } else if (await maybeRecompute(t.id)) {
      recomputed++;
    }
  }

  // レート制限の窓(24時間)を過ぎた記録は不要なので48時間で消し込む。
  // ハッシュは日替わりソルトのため、残存中も日をまたげば突き合わせ不能
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  await db.delete(rateEvents).where(lt(rateEvents.createdAt, cutoff));
  // 通報のIP記録は廃止済み。過去に保存された分を消し込む
  await db.update(reports).set({ ipHash: null }).where(isNotNull(reports.ipHash));

  return NextResponse.json({ themes: active.length, recomputed });
}
