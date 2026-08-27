import type { Metadata } from "next";
import Link from "next/link";
import { listThemesPage } from "@/lib/queries";
import { PROMOTION_MIN_PARTICIPANTS, THEMES_PAGE_SIZE } from "@/lib/config";
import { ThemeInfiniteList } from "@/components/ThemeInfiniteList";

export const metadata: Metadata = { title: "テーマ一覧" };
export const dynamic = "force-dynamic";

// 新着をデフォルト表示にする(新しい議論に人が集まる方が新陳代謝の思想に合うため)。
// 新着=全テーマを新着順、議論中=10票以上を勢い順。どちらもスクロールで無限に追加読み込みする。
export default async function ThemesPage({ searchParams }: PageProps<"/themes">) {
  const { tab } = await searchParams;
  const showActive = tab === "active";
  const currentTab = showActive ? "active" : "fresh";
  const initialItems = await listThemesPage(currentTab, 0);

  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-stone-400">
        <Link
          href="/themes"
          className={`px-4 py-2 text-sm font-medium ${!showActive ? "border-b-2 border-stone-900" : "text-stone-600"}`}
        >
          新着
        </Link>
        <Link
          href="/themes?tab=active"
          className={`px-4 py-2 text-sm font-medium ${showActive ? "border-b-2 border-stone-900" : "text-stone-600"}`}
        >
          議論中
        </Link>
      </div>

      {initialItems.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-400 p-8 text-center text-sm text-stone-600">
          {showActive ? (
            <>
              {PROMOTION_MIN_PARTICIPANTS}人以上が投票したテーマがここに並びます。
              <Link href="/themes" className="ml-1 underline">
                新着タブ
              </Link>
              から投票に参加してください。
            </>
          ) : (
            <>
              まだ新着テーマがありません。
              <Link href="/new" className="ml-1 underline">
                最初のテーマを提案してみませんか?
              </Link>
            </>
          )}
        </div>
      ) : (
        <ThemeInfiniteList
          key={currentTab}
          tab={currentTab}
          initialItems={initialItems}
          pageSize={THEMES_PAGE_SIZE}
        />
      )}
    </div>
  );
}
