import { NextResponse } from "next/server";
import { getParticipantId } from "@/lib/participant";
import { getMyVotes, getMathResult } from "@/lib/queries";
import type { MathResultJson } from "@/lib/recompute";

// テーマページ本体はエッジキャッシュされる(revalidate)。個人化(自分の投票・
// 意見マップ上の自分の位置)は cookie に依存して動的なので、この軽量エンドポイントへ
// 分離する。pidMap(参加者UUID→行列index)は返さず、index(整数)だけを返して身元を漏らさない。
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const participantId = await getParticipantId();
  if (!participantId) {
    return NextResponse.json(
      { votes: {}, myIndex: null },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const [votes, mathRow] = await Promise.all([getMyVotes(id, participantId), getMathResult(id)]);
  const raw = (mathRow?.result ?? null) as MathResultJson | null;
  const myIndex = raw?.pidMap?.[participantId] ?? null;
  return NextResponse.json(
    { votes, myIndex },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
