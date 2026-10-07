import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTagVocabulary, listThemesForTab } from "@/lib/queries";
import { semanticThemeIds } from "@/lib/search";
import { getParticipantId } from "@/lib/participant";
import { ThemesView } from "../_shared/ThemesView";

export const metadata: Metadata = { title: "テーマを検索" };

// 検索(タイトル・説明文の部分一致 + 意味検索)。意味検索はリクエスト依存
// (IP のレート制限)なので動的描画。参加者の印もここでサーバー側で付ける
export const dynamic = "force-dynamic";

export default async function SearchThemesPage({ searchParams }: PageProps<"/themes/search">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim().slice(0, 100) : "";
  if (!query) redirect("/themes");
  const participantId = await getParticipantId();
  const [tagVocabulary, items] = await Promise.all([
    getTagVocabulary(),
    listThemesForTab(
      "fresh",
      participantId,
      0,
      undefined,
      query,
      undefined,
      undefined,
      await semanticThemeIds(query),
    ),
  ]);
  return (
    <ThemesView
      tab="fresh"
      items={items}
      tagVocabulary={tagVocabulary}
      query={query}
      personalize={false}
    />
  );
}
