import type { Metadata } from "next";
import { getTagVocabulary, listThemesForTab } from "@/lib/queries";
import { getParticipantId } from "@/lib/participant";
import { ThemesView } from "../_shared/ThemesView";

export const metadata: Metadata = { title: "テーマ一覧" };

// 提案済みタブ(このブラウザから提案したテーマ)。cookie 依存なので動的描画。
// 参加者の印はサーバー側で付くため、クライアントでの取得は不要
export const dynamic = "force-dynamic";

export default async function ThemesTabPage() {
  const participantId = await getParticipantId();
  const [tagVocabulary, items] = await Promise.all([
    getTagVocabulary(),
    listThemesForTab("proposed", participantId, 0),
  ]);
  return <ThemesView tab="proposed" items={items} tagVocabulary={tagVocabulary} personalize={false} />;
}
