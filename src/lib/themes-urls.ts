import { TAGS_PER_THEME } from "./config";

// テーマ一覧の URL を組み立てる純関数。サーバーコンポーネントと proxy(旧URLの
// リダイレクト)の両方から使うので、DB やクライアント部品に依存しないここに置く。
//
// URL の設計(クエリ文字列を読むとページ全体が動的描画になる仕様のため、
// 共有できる一覧はすべてパスで表す):
//   /themes                 新着(ISR)
//   /themes/active          人気(ISR)
//   /themes/tag/<a,b>       タグ「いずれかを含む」(ISR)
//   /themes/tag/<a,b>/all   タグ「すべて含む」(ISR)
//   /themes/search?q=       検索(動的: 意味検索がリクエスト依存)
//   /themes/unread など     個人タブ(動的: cookie 依存)

export type TagMode = "and" | "or";

export function tagListUrl(tags: string[], mode: TagMode): string {
  if (tags.length === 0) return "/themes";
  const joined = encodeURIComponent(tags.join(","));
  return mode === "and" ? `/themes/tag/${joined}/all` : `/themes/tag/${joined}`;
}

// ISR 化前のクエリ式 URL(/themes?tab= / ?tag=&tagmode= / ?q=)の行き先。
// 旧ページと同じ優先順位(タグ > 検索語 > タブ)。クエリは引き継がず、常に正規の形にする。
// タグの解釈は lib/queries の parseTagFilter と同じ規則(カンマ区切り・上限あり)だが、
// proxy のバンドルに DB コードを入れないためここで独立に書く
export function legacyThemesDestination(params: URLSearchParams): string {
  const tags = (params.get("tag") ?? "")
    .slice(0, 200)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, TAGS_PER_THEME);
  if (tags.length > 0) return tagListUrl(tags, params.get("tagmode") === "and" ? "and" : "or");
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  if (q) return `/themes/search?q=${encodeURIComponent(q)}`;
  const tab = params.get("tab");
  if (tab === "active" || tab === "unread" || tab === "mine" || tab === "proposed") {
    return `/themes/${tab}`;
  }
  return "/themes";
}
