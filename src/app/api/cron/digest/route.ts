import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/admin-auth";
import {
  generateAndStoreDigest,
  getDigestRow,
  parseWeekKey,
  postDigestToX,
  previousWeekStart,
} from "@/lib/digest";
import { isXConfigured } from "@/lib/x-post";

// 集計は数本のクエリと(設定されていれば)X APIの往復だけなので、
// 再計算のcron(300秒)ほどは要らない。既定より長めに取って取りこぼしを防ぐ
export const maxDuration = 60;

// 週間ダイジェストの生成。vercel.json のcronで毎週月曜11:00 UTC(=20:00 JST)に走り、
// 直前に終わった週(月曜0:00 JST 〜 翌月曜0:00 JST)を集計して保存する。
// ?week=YYYY-Www を付けると、その週を指定して作り直せる(取りこぼしの復旧用)。
// 認証は再計算のcronと同じ(Bearer CRON_SECRET を時間一定で突き合わせる)
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || !safeEqual(auth ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const weekParam = new URL(request.url).searchParams.get("week");
  const weekStart = weekParam ? parseWeekKey(weekParam) : previousWeekStart(new Date());
  if (!weekStart) {
    return NextResponse.json({ error: "invalid week" }, { status: 400 });
  }

  const digest = await generateAndStoreDigest(weekStart);

  // Xの資格情報が無い環境では下書きの保存までで止める(管理画面から手で投稿できる)。
  // 既に投稿済みの週を作り直したときも二重投稿はしない
  let posted: { id: string } | { error: string } | null = null;
  if (isXConfigured()) {
    const row = await getDigestRow(digest.weekStart);
    if (row && !row.postedAt) {
      const res = await postDigestToX(row);
      posted = res.ok ? { id: res.id } : { error: res.error };
    }
  }

  return NextResponse.json({
    weekStart: digest.weekStart,
    weekKey: digest.weekKey,
    posted,
  });
}
