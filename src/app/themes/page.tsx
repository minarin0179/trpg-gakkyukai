import type { Metadata } from "next";
import { getTagVocabulary, listThemesForTab } from "@/lib/queries";
import { ThemesView } from "./_shared/ThemesView";

export const metadata: Metadata = { title: "テーマ一覧" };

// 新着タブ(全テーマを新着順)。全員に同じ内容なので ISR で60秒キャッシュし、
// CDN から返す(一覧はスクレイパーに最も叩かれるページで、関数実行をゼロにするのが目的)。
// cookie や searchParams を読むとページ全体が動的描画に戻るので、ここでは読まない。
// 参加者ごとの印(参加済み・新着N件)は ThemeInfiniteList がクライアントで取得する。
// 新テーマの投稿・タグ変更・運営の削除時は revalidateThemeLists で即時に作り直す。
// 時間ベースの再生成はカードの投票数・意見数を追いかけるための保険にすぎないので
// 長めにとる(ISR書き込みは再生成のたびに課金される。60秒ではアクセスが続く限り
// 毎分書き直しており、週数件のテーマ追加に対して明らかに過剰だった)。
// 値は Next.js の制約でリテラルにする必要がある(人気・タグページも同じ値)
export const revalidate = 1800;

export default async function ThemesPage() {
  const [tagVocabulary, items] = await Promise.all([
    getTagVocabulary(),
    listThemesForTab("fresh", null, 0),
  ]);
  return <ThemesView tab="fresh" items={items} tagVocabulary={tagVocabulary} personalize />;
}
