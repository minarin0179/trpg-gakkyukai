import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTagVocabulary, listThemesForTab } from "@/lib/queries";
import { ThemesView } from "../../_shared/ThemesView";
import { parseTagParam } from "../../_shared/tag-param";

// タグ絞り込み「いずれかを含む」。タグはカンマ区切りで複数指定できる。
// URL ごとに ISR 60秒(組み合わせの数だけキャッシュ項目が増えるが、同じ URL は
// 60秒に1回しか描画されない)。クローラーには robots で辿らせない。
export const revalidate = 60;

// 動的セグメントをランタイムで ISR キャッシュするには generateStaticParams が必須
// (空配列=ビルド時は生成せず、アクセスされた組み合わせだけをその場でキャッシュする)
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: PageProps<"/themes/tag/[tag]">): Promise<Metadata> {
  const tags = parseTagParam((await params).tag);
  return { title: tags.length ? `タグ「${tags.join("」「")}」のテーマ` : "テーマ一覧" };
}

export default async function TagThemesPage({ params }: PageProps<"/themes/tag/[tag]">) {
  const tags = parseTagParam((await params).tag);
  if (tags.length === 0) notFound();
  const [tagVocabulary, items] = await Promise.all([
    getTagVocabulary(),
    listThemesForTab("fresh", null, 0, undefined, undefined, tags.join(","), "or"),
  ]);
  return (
    <ThemesView
      tab="fresh"
      items={items}
      tagVocabulary={tagVocabulary}
      selectedTags={tags}
      tagMode="or"
      personalize
    />
  );
}
