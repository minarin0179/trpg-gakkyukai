import { NextResponse } from "next/server";
import { getThemeCounts } from "@/lib/queries";

// テーマの投票数・参加人数。ページ本体はISR(30分)で数字が遅れるため、
// この軽量なエンドポイントをクライアントが取得して鮮度を補う。
// 全員に同じ内容なのでCDNで60秒共有キャッシュし、HIT時は関数実行なし。
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const counts = await getThemeCounts(id);
  return NextResponse.json(
    { voterCount: counts.voterCount, voteCount: counts.voteCount },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=240",
      },
    },
  );
}
