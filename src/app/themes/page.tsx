import type { Metadata } from "next";
import Link from "next/link";
import { listThemesPage, listParticipatedPage } from "@/lib/queries";
import { getParticipantId } from "@/lib/participant";
import { PROMOTION_MIN_PARTICIPANTS, THEMES_PAGE_SIZE } from "@/lib/config";
import { ThemeInfiniteList } from "@/components/ThemeInfiniteList";
import type { ThemesTab } from "@/app/themes/actions";

export const metadata: Metadata = { title: "テーマ一覧" };
export const dynamic = "force-dynamic";

// 新着=全テーマを新着順 / 人気=10票以上を勢い順 / 参加済み=自分が投票したテーマを最終投票順。
// どのタブもスクロール到達で無限に追加読み込みする。新着をデフォルト表示にする。
export default async function ThemesPage({ searchParams }: PageProps<"/themes">) {
  const { tab } = await searchParams;
  const currentTab: ThemesTab = tab === "active" ? "active" : tab === "mine" ? "mine" : "fresh";

  const initialItems =
    currentTab === "mine"
      ? await listParticipatedPage(await getParticipantId(), 0)
      : await listThemesPage(currentTab, 0);

  const tabClass = (active: boolean) =>
    `px-4 py-2 text-sm font-medium ${active ? "border-b-2 border-stone-900" : "text-stone-600"}`;

  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-stone-400">
        <Link href="/themes" className={tabClass(currentTab === "fresh")}>
          新着
        </Link>
        <Link href="/themes?tab=active" className={tabClass(currentTab === "active")}>
          人気
        </Link>
        <Link href="/themes?tab=mine" className={tabClass(currentTab === "mine")}>
          参加済み
        </Link>
      </div>

      {initialItems.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-400 p-8 text-center text-sm text-stone-600">
          {currentTab === "active" ? (
            <>
              {PROMOTION_MIN_PARTICIPANTS}人以上が投票したテーマがここに並びます。
              <Link href="/themes" className="ml-1 underline">
                新着タブ
              </Link>
              から投票に参加してください。
            </>
          ) : currentTab === "mine" ? (
            <>
              まだ参加したテーマがありません。気になるテーマに投票すると、ここに集まります。
              <Link href="/themes" className="ml-1 underline">
                新着タブ
              </Link>
              から探してみてください。
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
