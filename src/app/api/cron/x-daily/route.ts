import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/admin-auth";
import { buildDailyPostText, isMondayJst, jstDateKey } from "@/lib/daily-pick";
import { markPostedDaily, recentlyFeatured, wasPostedDaily } from "@/lib/x-post-guard";
import { isXConfigured, postToX, xPostUrl } from "@/lib/x-post";
import { notifyAdmin } from "@/lib/notify";

export const maxDuration = 60;

// 毎日のX投稿。週に1回だけだと流れてしまい、アカウントを見に来る理由が続かないため、
// 週次の投稿が無い日(火〜日)に1テーマずつ紹介する。
// vercel.json のcronで毎日11:00 UTC(=20:00 JST)に走る。月曜(JST)は週次の投稿の日なので何もしない。
// ?force=1 で月曜の判定と目印を無視して投稿し直せる。認証は他のcronと同じ
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || !safeEqual(auth ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const force = new URL(request.url).searchParams.get("force") === "1";
  const now = new Date();
  const day = jstDateKey(now);

  if (!force && isMondayJst(now)) {
    return NextResponse.json({ day, posted: false, reason: "weekly-day" });
  }

  const draft = await buildDailyPostText(now, await recentlyFeatured(now));
  if (!draft) {
    console.log(`daily-x-post day=${day} skipped reason=no-theme`);
    return NextResponse.json({ day, posted: false, reason: "no-theme" });
  }

  // 資格情報が無いと cron は200で終わって誰も気づかないため、運営に知らせる
  if (!isXConfigured()) {
    console.log(`daily-x-post day=${day} skipped reason=x-not-configured`);
    await notifyAdmin("X日次投稿: Xの資格情報が未設定のため投稿していません(X_API_KEY ほか4つ)");
    return NextResponse.json({ day, posted: false, reason: "x-not-configured", text: draft.text });
  }

  if (!force && (await wasPostedDaily(day))) {
    console.log(`daily-x-post day=${day} skipped reason=already-posted`);
    return NextResponse.json({ day, posted: false, reason: "already-posted" });
  }

  try {
    const { id } = await postToX(draft.text);
    await markPostedDaily(day, draft.pick.id, id, now);
    console.log(`daily-x-post day=${day} posted id=${id} kind=${draft.pick.kind}`);
    await notifyAdmin(`X日次投稿: 投稿しました ${xPostUrl(id)}`);
    return NextResponse.json({ day, posted: true, id, kind: draft.pick.kind, text: draft.text });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.log(`daily-x-post day=${day} failed error=${error}`);
    await notifyAdmin(`X日次投稿: 失敗しました: ${error.slice(0, 300)}`);
    return NextResponse.json({ day, posted: false, error }, { status: 500 });
  }
}
