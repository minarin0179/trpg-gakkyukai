import type { Metadata } from "next";
import Link from "next/link";
import { getTagVocabulary, listThemesForTab, type ThemesTab } from "@/lib/queries";
import { semanticThemeIds } from "@/lib/search";
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
  const { tab, q, tag, tagmode } = await searchParams;
  const tagFilter = typeof tag === "string" ? tag.trim().slice(0, 200) : "";
  // タグ絞り込みの折りたたみ開閉: パラメータの有無で判定する。
  // 最後のタグを外しても ?tag= を残すことで、開いたまま選び直せる
  const tagPanelOpen = typeof tag === "string";
  const tagMode: "and" | "or" = tagmode === "and" ? "and" : "or";
  const selectedTags = tagFilter.split(",").map((t) => t.trim()).filter(Boolean);
  // チップの切替リンク用: タグ集合とモードからURLを組み立てる
  // タグ0個でもモード(tagmode)を持ち回る: 先に条件を選んでからタグを選べる
  const tagUrl = (tags: string[], mode: "and" | "or") =>
    `/themes?tag=${encodeURIComponent(tags.join(","))}${mode === "and" ? "&tagmode=and" : ""}`;
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
  const tagVocabulary = await getTagVocabulary();
  const initialItems = tagFilter
    ? await listThemesForTab("fresh", participantId, 0, undefined, undefined, tagFilter, tagMode)
    : searching
      ? // 意味検索はリクエスト依存(レート制限)なのでページ側で解決して渡す
        await listThemesForTab(
          "fresh",
          participantId,
          0,
          undefined,
          query,
          undefined,
          undefined,
          await semanticThemeIds(query),
        )
      : await listThemesForTab(currentTab, participantId, 0);

  // タブは縮めない・折り返さない(狭い画面では行ごと横スクロール)。
  // 縮められると「新着」が1文字ずつ縦に折れる
  const tabClass = (active: boolean) =>
    `shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium ${active ? "border-b-2 border-stone-900" : "text-stone-600"}`;

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
          className="min-w-0 flex-1 rounded-md border border-stone-400 bg-white px-3 py-2 text-sm placeholder:text-stone-400"
        />
        <button
          type="submit"
          className="shrink-0 rounded-md bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700"
        >
          検索
        </button>
      </form>

      {/* タグ絞り込み: 複数選択可(チップの再クリックで解除)。
          「いずれか(OR)/すべて(かつ)」はトグルで切り替える */}
      {/* 「タグで絞り込み」と「ランダムに開く」を同じ行に置く(左右に振り分け)。
          絞り込みを開いても右のリンクは行頭の高さに留まる。
          ランダムに開くはリダイレクト先が毎回変わるため Link のプリフェッチを避けて素のアンカーにする(要望#4575) */}
      <div className="mb-4 flex items-start justify-between gap-3">
      {tagVocabulary.length > 0 ? (
        <details className="min-w-0 flex-1" open={tagPanelOpen}>
          <summary className="cursor-pointer text-sm text-stone-600 underline">
            タグで絞り込み{selectedTags.length > 0 ? `: ${selectedTags.join("、")}` : ""}
          </summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tagVocabulary.map((tag) => {
              const active = selectedTags.includes(tag);
              const next = active
                ? selectedTags.filter((t) => t !== tag)
                : [...selectedTags, tag];
              return (
                <Link
                  key={tag}
                  prefetch={false}
                  href={tagUrl(next, tagMode)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs transition ${
                    active
                      ? "border-stone-900 bg-stone-900 text-white"
                      : "border-stone-300 bg-white text-stone-600 hover:border-stone-500"
                  }`}
                >
                  {tag}
                </Link>
              );
            })}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-stone-600">
            複数タグの条件:
              {(["or", "and"] as const).map((m) => (
                <Link
                  key={m}
                  prefetch={false}
                  href={tagUrl(selectedTags, m)}
                  className={`rounded-md border px-2 py-0.5 transition ${
                    tagMode === m
                      ? "border-stone-900 bg-stone-900 text-white"
                      : "border-stone-300 text-stone-600 hover:border-stone-500"
                  }`}
                >
                  {m === "or" ? "いずれかを含む" : "すべて含む"}
                </Link>
              ))}
          </p>
        </details>
      ) : (
        <div />
      )}
        <a
          href="/themes/random"
          className="shrink-0 whitespace-nowrap text-sm text-stone-600 underline hover:text-stone-800"
        >
          ランダムに開く
        </a>
      </div>

      {tagFilter ? (
        <>
          <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-stone-700">
            <span>
              タグ「{selectedTags.join("」「")}」
              {selectedTags.length >= 2 ? (tagMode === "and" ? "をすべて含む" : "のいずれかを含む") : "の"}
              テーマ
            </span>
            <Link href="/themes" className="text-xs text-stone-600 underline">
              絞り込みを解除
            </Link>
          </p>
          {initialItems.length === 0 ? (
            <div className="rounded-lg border border-dashed border-stone-400 p-8 text-center text-sm text-stone-600">
              このタグが付いたテーマはまだありません。
            </div>
          ) : (
            <ThemeInfiniteList
              key={`tag:${tagMode}:${tagFilter}`}
              tab="fresh"
              tag={tagFilter}
              tagMode={tagMode}
              initialItems={initialItems}
              pageSize={THEMES_PAGE_SIZE}
            />
          )}
        </>
      ) : searching ? (
        <>
          <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-stone-700">
            <span>
              「{query}」の検索結果
            </span>
            <Link href="/themes" className="text-xs text-stone-600 underline">
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
