import type { Metadata } from "next";
import Link from "next/link";
import { listThemesForTab, type ThemesTab } from "@/lib/queries";
import { getParticipantId } from "@/lib/participant";
import { PROMOTION_MIN_PARTICIPANTS, THEMES_PAGE_SIZE } from "@/lib/config";
import { ThemeInfiniteList } from "@/components/ThemeInfiniteList";

export const metadata: Metadata = { title: "テーマ一覧" };
export const dynamic = "force-dynamic";

// 新着=全テーマ新着順 / 人気=10票以上を勢い順 / 参加済み=自分が投票したテーマ /
// 未参加=自分がまだ投票していないテーマ(参加済みの逆)を新着順。
// 検索語(q)があればタブに関係なく、タイトル・説明文の部分一致で新着順に表示。
// どのタブ・検索もスクロール到達で無限に追加読み込みする。新着をデフォルトにする。
export default async function ThemesPage({ searchParams }: PageProps<"/themes">) {
  const { tab, q, tag } = await searchParams;
  const tagFilter = typeof tag === "string" ? tag.trim().slice(0, 100) : "";
  const query = typeof q === "string" ? q.trim().slice(0, 100) : "";
  const searching = query.length > 0;
  const currentTab: ThemesTab =
    tab === "active"
      ? "active"
      : tab === "mine"
        ? "mine"
        : tab === "unread"
          ? "unread"
          : tab === "proposed"
            ? "proposed"
            : "fresh";

  const participantId = await getParticipantId();
  const initialItems = tagFilter
    ? await listThemesForTab("fresh", participantId, 0, undefined, undefined, tagFilter)
    : searching
      ? await listThemesForTab("fresh", participantId, 0, undefined, query)
      : await listThemesForTab(currentTab, participantId, 0);

  const tabClass = (active: boolean) =>
    `px-4 py-2 text-sm font-medium ${active ? "border-b-2 border-stone-900" : "text-stone-600"}`;

  return (
    <div>
      {/* 検索: タイトル・説明文からキーワードで探す(重複テーマの発見にも) */}
      <form method="get" action="/themes" role="search" className="mb-4 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          aria-label="テーマを検索"
          placeholder="タイトル・説明文からキーワードで探す"
          className="min-w-0 flex-1 rounded-md border border-stone-400 bg-white px-3 py-2 text-sm placeholder:text-stone-400 dark:border-stone-700 dark:bg-stone-900"
        />
        <button
          type="submit"
          className="shrink-0 rounded-md bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
        >
          検索
        </button>
      </form>

      {tagFilter ? (
        <>
          <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-stone-700 dark:text-stone-300">
            <span>
              タグ「{tagFilter}」のテーマ
            </span>
            <Link href="/themes" className="text-xs text-stone-600 underline dark:text-stone-400">
              絞り込みを解除
            </Link>
          </p>
          {initialItems.length === 0 ? (
            <div className="rounded-lg border border-dashed border-stone-400 p-8 text-center text-sm text-stone-600">
              このタグが付いたテーマはまだありません。
            </div>
          ) : (
            <ThemeInfiniteList
              key={`tag:${tagFilter}`}
              tab="fresh"
              tag={tagFilter}
              initialItems={initialItems}
              pageSize={THEMES_PAGE_SIZE}
            />
          )}
        </>
      ) : searching ? (
        <>
          <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-stone-700 dark:text-stone-300">
            <span>
              「{query}」の検索結果
            </span>
            <Link href="/themes" className="text-xs text-stone-600 underline dark:text-stone-400">
              検索を解除
            </Link>
          </p>
          {initialItems.length === 0 ? (
            <div className="rounded-lg border border-dashed border-stone-400 p-8 text-center text-sm text-stone-600">
              「{query}」に一致するテーマは見つかりませんでした。
              <Link href="/new" className="ml-1 underline">
                新しく提案してみませんか?
              </Link>
            </div>
          ) : (
            <ThemeInfiniteList
              key={`search:${query}`}
              tab="fresh"
              query={query}
              initialItems={initialItems}
              pageSize={THEMES_PAGE_SIZE}
            />
          )}
        </>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-1 overflow-x-auto border-b border-stone-400">
            <Link href="/themes" className={tabClass(currentTab === "fresh")}>
              新着
            </Link>
            <Link href="/themes?tab=active" className={tabClass(currentTab === "active")}>
              人気
            </Link>
            <Link href="/themes?tab=unread" className={tabClass(currentTab === "unread")}>
              未参加
            </Link>
            <Link href="/themes?tab=mine" className={tabClass(currentTab === "mine")}>
              参加済み
            </Link>
            <Link href="/themes?tab=proposed" className={tabClass(currentTab === "proposed")}>
              提案済み
            </Link>
            {/* ランダムに1テーマ開く(要望#4575)。リダイレクト先が毎回変わるため
                Linkのプリフェッチを避けて素のアンカーにする */}
            <a
              href="/themes/random"
              className="ml-auto shrink-0 whitespace-nowrap px-2 py-2 text-xs text-stone-600 underline hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
            >
              ランダムに開く
            </a>
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
              ) : currentTab === "unread" ? (
                <>未参加のテーマはありません。公開中のテーマにはすべて参加済みです。</>
              ) : currentTab === "proposed" ? (
                <>
                  このブラウザから提案したテーマはまだありません。
                  <Link href="/new" className="ml-1 underline">
                    テーマを提案してみませんか?
                  </Link>
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
        </>
      )}
    </div>
  );
}
