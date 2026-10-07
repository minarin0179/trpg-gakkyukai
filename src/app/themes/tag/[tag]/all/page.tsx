import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTagVocabulary, listThemesForTab } from "@/lib/queries";
import { ThemesView } from "../../../_shared/ThemesView";
import { parseTagParam } from "../../../_shared/tag-param";

// タグ絞り込み「すべて含む」。仕組みは ../page.tsx と同じ
export const revalidate = 60;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: PageProps<"/themes/tag/[tag]/all">): Promise<Metadata> {
  const tags = parseTagParam((await params).tag);
  return { title: tags.length ? `タグ「${tags.join("」「")}」をすべて含むテーマ` : "テーマ一覧" };
}

export default async function TagAllThemesPage({ params }: PageProps<"/themes/tag/[tag]/all">) {
  const tags = parseTagParam((await params).tag);
  if (tags.length === 0) notFound();
  const [tagVocabulary, items] = await Promise.all([
    getTagVocabulary(),
    listThemesForTab("fresh", null, 0, undefined, undefined, tags.join(","), "and"),
  ]);
  return (
    <ThemesView
      tab="fresh"
      items={items}
      tagVocabulary={tagVocabulary}
      selectedTags={tags}
      tagMode="and"
      personalize
    />
  );
}
