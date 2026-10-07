import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/admin-auth";
import { composeNewThemeText } from "@/lib/x-new-theme-text";
import {
  listUnpostedThemes,
  postNewTheme,
  releaseStalePending,
  themeUrl,
} from "@/lib/x-new-themes";
import { isXConfigured } from "@/lib/x-post";

export const maxDuration = 60;

// 新規テーマの X 自動投稿。vercel.json の cron で10分ごとに走り、未投稿のテーマを
// 古い順に最大5件投稿する(仕組みの詳細は lib/x-new-themes.ts)。
// ?dry=1 で投稿せずに対象と投稿文だけを返す(動作確認用)。
// 認証は他の cron と同じ(Bearer CRON_SECRET を時間一定で突き合わせる)
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || !safeEqual(auth ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dry = new URL(request.url).searchParams.get("dry") === "1";

  const released = await releaseStalePending();
  const candidates = await listUnpostedThemes();
  if (dry || !isXConfigured()) {
    const reason = dry ? "dry-run" : "x-not-configured";
    console.log(`new-theme-x-post skipped reason=${reason} candidates=${candidates.length}`);
    return NextResponse.json({
      posted: [],
      reason,
      candidates: candidates.map((t) => ({
        id: t.id,
        text: composeNewThemeText(t.title, themeUrl(t.id)),
      })),
    });
  }

  const posted: { id: string; postId: string }[] = [];
  for (const theme of candidates) {
    try {
      const result = await postNewTheme(theme);
      if (result) posted.push(result);
    } catch (e) {
      // 1件失敗したらこの回は打ち切る(X 側の障害・レート制限で残りも失敗する前提)。
      // 失敗した行は null に戻っているので次回に再試行される。
      // 秘密は x-post.ts の中だけで扱うため、ここに出る文言には含まれない
      const error = e instanceof Error ? e.message : String(e);
      console.log(`new-theme-x-post failed theme=${theme.id} error=${error}`);
      return NextResponse.json(
        { posted, released, failed: theme.id, error },
        { status: 500 },
      );
    }
  }
  console.log(`new-theme-x-post posted=${posted.length} released=${released}`);
  return NextResponse.json({ posted, released });
}
