import { NextResponse } from "next/server";
import { getParticipantId } from "@/lib/participant";
import { answeredCountsForParticipant } from "@/lib/queries";

// テーマ一覧(ISR)のカードに付ける参加者ごとの印を、まとめて1回で返す。
// ページ本体は全員共通で CDN から返るので、cookie 依存の部分だけをここに分離する
// (テーマページの /api/t/[id]/me と同じ考え方)。返すのは投票済み意見数だけで、
// 未回答数はクライアントが意見数から引いて出す。
export const dynamic = "force-dynamic";

const MAX_IDS = 50;
const ID_RE = /^[A-Za-z0-9_-]{1,32}$/;

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("ids") ?? "";
  const ids = [...new Set(raw.split(",").map((s) => s.trim()).filter((s) => ID_RE.test(s)))].slice(
    0,
    MAX_IDS,
  );
  const headers = { "Cache-Control": "private, no-store" };
  const participantId = await getParticipantId();
  if (!participantId || ids.length === 0) {
    return NextResponse.json({ participant: participantId !== null, answered: {} }, { headers });
  }
  const answered = await answeredCountsForParticipant(ids, participantId);
  return NextResponse.json({ participant: true, answered }, { headers });
}
