import { X_MAX_UNITS, truncateToUnits, xLength } from "./digest-text";

// 新規テーマの X 投稿文(DB に触れない純関数。テスト対象)。
// 形: 見出し / 「タイトル」 / テーマのURL。URL は X 側で常に23単位と数える。
// タイトルが長すぎて収まらないときは末尾を省略して「…」を付ける
const HEADER = "新しいテーマが提案されました";

export function composeNewThemeText(title: string, url: string): string {
  const fixed = xLength(HEADER) + 1 + xLength("「」") + 1 + xLength(url);
  const room = Math.max(X_MAX_UNITS - fixed, 0);
  const t = truncateToUnits(title.trim(), room);
  return [HEADER, `「${t}」`, url].join("\n");
}
