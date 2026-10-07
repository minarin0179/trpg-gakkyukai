import type { Metadata } from "next";
import { getTagVocabulary, listThemesForTab } from "@/lib/queries";
import { ThemesView } from "../_shared/ThemesView";

export const metadata: Metadata = { title: "テーマ一覧" };

// 人気タブ(10票以上を勢い順)。新着と同じく ISR 60秒(理由は ../page.tsx)
export const revalidate = 60;

export default async function ActiveThemesPage() {
  const [tagVocabulary, items] = await Promise.all([
    getTagVocabulary(),
    listThemesForTab("active", null, 0),
  ]);
  return <ThemesView tab="active" items={items} tagVocabulary={tagVocabulary} personalize />;
}
