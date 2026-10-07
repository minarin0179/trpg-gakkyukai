import Link from "next/link";
import type { ThemeWithCounts, ThemesTab } from "@/lib/queries";
import { PROMOTION_MIN_PARTICIPANTS, THEMES_PAGE_SIZE } from "@/lib/config";
import { tagListUrl } from "@/lib/themes-urls";
import { ThemeInfiniteList } from "@/components/ThemeInfiniteList";

// テーマ一覧の見た目をタブ・タグ・検索のページで共有する(サーバーコンポーネント)。
// 一覧ページは ISR(新着・人気・タグ)と動的(検索・個人タブ)に分かれており、
// 各 page.tsx はデータの取り方だけを持ち、描画はここに集める。
// URL の設計は lib/themes-urls.ts を参照

export function ThemesView({
  tab,
  items,
  tagVocabulary,
  selectedTags = [],
  tagMode = "or",
  query = "",
  personalize,
}: {
  tab: ThemesTab;
  items: ThemeWithCounts[];
  tagVocabulary: string[];
  selectedTags?: string[];
  tagMode?: "and" | "or";
  query?: string;
  // ISR ページでは参加者ごとの印(参加済み・新着N件)をクライアントで取得する
  personalize: boolean;
}) {
  const tagFilter = selectedTags.join(",");
  const searching = query.length > 0;

  // タブは縮めない・折り返さない(狭い画面では行ごと横スクロール)。
  // 縮められると「新着」が1文字ずつ縦に折れる
  const tabClass = (active: boolean) =>
    `shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium ${active ? "border-b-2 border-stone-900" : "text-stone-600"}`;

  return (
    <div>
      {/* 検索窓・タグ絞り込み・タブ行はひとかたまりで画面上端(サイトヘッダーの下)に
          貼り付ける。無限スクロールで長くなった一覧からタブや検索へ戻れないという要望への対応。
          top-14 はサイトヘッダーの高さ(layout.tsx の h-14)に合わせる。
          -mt-3/pt-3 は貼り付いたときにヘッダーとの間に余白を持たせるため(通常時の位置は不変)。
          -mx-4/px-4 で main の左右パディング分まで背景を広げ、下を流れるカードを隠す */}
      <div className="sticky top-14 z-10 -mx-4 -mt-3 bg-stone-50 px-4 pt-3">
        {/* 検索: タイトル・説明文からキーワードで探す(重複テーマの発見にも) */}
        <form method="get" action="/themes/search" role="search" className="mb-4 flex gap-2">
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
        {/* 「タグで絞り込み」の行の右端に「ランダムに開く」を重ねて置く。
            リンクは絶対配置なので、絞り込みを開いたときのタグ一覧は全幅を使える
            (横並びにするとチップの折り返し幅が狭まりパネルが縦に伸びる)。
            ランダムに開くはリダイレクト先が毎回変わるため Link のプリフェッチを避けて素のアンカーにする(要望#4575) */}
        <div className="relative mb-4">
          <a
            href="/themes/random"
            rel="nofollow"
            className="absolute right-0 top-0 whitespace-nowrap text-sm text-stone-600 underline hover:text-stone-800"
          >
            ランダムに開く
          </a>
          {tagVocabulary.length > 0 ? (
            // タグで絞り込み中でも既定では開かない(以前は開いていた)。上部が貼り付くように
            // なったため、開いたままだとチップ一覧が画面の大半を占める。選択中のタグは
            // 要約行と一覧の見出しに出ているので、追加・解除するときだけ開けばよい
            <details>
              <summary className="cursor-pointer pr-28 text-sm text-stone-600 underline">
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
                      rel="nofollow"
                      href={tagListUrl(next, tagMode)}
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
              {/* 条件の切り替えはタグを選んでから(タグ0個では条件に意味がないので /themes に戻る) */}
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-stone-600">
                <span className="shrink-0">複数タグの条件:</span>
                {(["or", "and"] as const).map((m) => (
                  <Link
                    key={m}
                    prefetch={false}
                    rel="nofollow"
                    href={tagListUrl(selectedTags, m)}
                    className={`whitespace-nowrap rounded-md border px-2 py-0.5 transition ${
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
            <div className="h-5" />
          )}
        </div>
        {!tagFilter && !searching && (
          <div className="mb-4 flex items-center gap-1 overflow-x-auto border-b border-stone-400">
            <Link href="/themes" className={tabClass(tab === "fresh")}>
              新着
            </Link>
            <Link href="/themes/active" className={tabClass(tab === "active")}>
              人気
            </Link>
            <Link href="/themes/unread" className={tabClass(tab === "unread")}>
              未参加
            </Link>
            <Link href="/themes/mine" className={tabClass(tab === "mine")}>
              参加済み
            </Link>
            <Link href="/themes/proposed" className={tabClass(tab === "proposed")}>
              提案済み
            </Link>
          </div>
        )}
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
          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-stone-400 p-8 text-center text-sm text-stone-600">
              このタグが付いたテーマはまだありません。
            </div>
          ) : (
            <ThemeInfiniteList
              key={`tag:${tagMode}:${tagFilter}`}
              tab="fresh"
              tag={tagFilter}
              tagMode={tagMode}
              initialItems={items}
              pageSize={THEMES_PAGE_SIZE}
              personalize={personalize}
            />
          )}
        </>
      ) : searching ? (
        <>
          <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-stone-700">
            <span>「{query}」の検索結果</span>
            <Link href="/themes" className="text-xs text-stone-600 underline">
              検索を解除
            </Link>
          </p>
          {items.length === 0 ? (
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
              initialItems={items}
              pageSize={THEMES_PAGE_SIZE}
              personalize={personalize}
            />
          )}
        </>
      ) : (
        <>
          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-stone-400 p-8 text-center text-sm text-stone-600">
              {tab === "active" ? (
                <>
                  {PROMOTION_MIN_PARTICIPANTS}人以上が投票したテーマがここに並びます。
                  <Link href="/themes" className="ml-1 underline">
                    新着タブ
                  </Link>
                  から投票に参加してください。
                </>
              ) : tab === "mine" ? (
                <>
                  まだ参加したテーマがありません。気になるテーマに投票すると、ここに集まります。
                  <Link href="/themes" className="ml-1 underline">
                    新着タブ
                  </Link>
                  から探してみてください。
                </>
              ) : tab === "unread" ? (
                <>未参加のテーマはありません。公開中のテーマにはすべて参加済みです。</>
              ) : tab === "proposed" ? (
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
              key={tab}
              tab={tab}
              initialItems={items}
              pageSize={THEMES_PAGE_SIZE}
              personalize={personalize}
            />
          )}
        </>
      )}
    </div>
  );
}
