import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/admin-auth";
import {
  buildWeeklyPostText,
  parseWeekKey,
  previousWeekStart,
  weekStartKey,
} from "@/lib/digest";
import { markPosted, wasPosted } from "@/lib/x-post-guard";
import { isXConfigured, postToX } from "@/lib/x-post";

// 集計は1本のクエリと(設定されていれば)X APIの往復だけなので、
// 再計算のcron(300秒)ほどは要らない。既定より長めに取って取りこぼしを防ぐ
export const maxDuration = 60;

// 週次のX投稿。vercel.json のcronで毎週月曜11:00 UTC(=20:00 JST)に走り、
// 直前に終わった週(月曜0:00 JST 〜 翌月曜0:00 JST)をその場で集計して投稿する。
// 結果はDBに保存しない。二重投稿はRuntime Cacheの目印だけで防ぐ(ベストエフォート)。
// ?week=YYYY-Www でその週を指定でき、?force=1 で目印を無視して投稿し直せる。
// 認証は再計算のcronと同じ(Bearer CRON_SECRET を時間一定で突き合わせる)
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || !safeEqual(auth ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const weekParam = params.get("week");
  const force = params.get("force") === "1";
  const weekStart = weekParam ? parseWeekKey(weekParam) : previousWeekStart(new Date());
  if (!weekStart) {
    return NextResponse.json({ error: "invalid week" }, { status: 400 });
  }
  const week = weekStartKey(weekStart);

  // Xの資格情報が無い環境では下書きを返すだけで止める(内容の確認には使える)
  if (!isXConfigured()) {
    const { text } = await buildWeeklyPostText(weekStart);
    console.log(`weekly-x-post week=${week} skipped reason=x-not-configured`);
    return NextResponse.json({ weekStart: week, posted: false, reason: "x-not-configured", text });
  }

  // 目印が残っている週は投稿し直さない(?force=1 のときは無視する)
  if (!force && (await wasPosted(weekStart))) {
    console.log(`weekly-x-post week=${week} skipped reason=already-posted`);
    return NextResponse.json({ weekStart: week, posted: false, reason: "already-posted" });
  }

  try {
    const { text } = await buildWeeklyPostText(weekStart);
    const { id } = await postToX(text);
    await markPosted(weekStart, id);
    console.log(`weekly-x-post week=${week} posted id=${id}`);
    return NextResponse.json({ weekStart: week, posted: true, id, text });
  } catch (e) {
    // 失敗はVercelのcronログに残す。秘密は x-post.ts の中だけで扱うため、
    // ここに出る文言(X APIの応答など)には含まれない
    const error = e instanceof Error ? e.message : String(e);
    console.log(`weekly-x-post week=${week} failed error=${error}`);
    return NextResponse.json({ weekStart: week, posted: false, error }, { status: 500 });
  }
}
