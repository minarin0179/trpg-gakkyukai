import { revalidatePath } from "next/cache";

// テーマに紐づくISRページをまとめて無効化する。/t/[id]/report(ISR 300s)を
// 忘れると、削除した意見が最大5分レポートに残る
export function revalidateTheme(themeId: string): void {
  revalidatePath(`/t/${themeId}`);
  revalidatePath(`/t/${themeId}/report`);
}

// テーマ一覧の ISR ページ(新着・人気・タグ絞り込み)をまとめて無効化する。
// テーマの追加・削除、タグの付け外しなど「一覧の中身が変わる」操作の後に呼ぶ。
// 投票数のような数値の更新は60秒の再生成に任せる(呼ばない)。
// タグページは組み合わせごとに別 URL なので、パターン指定で全部をまとめて対象にする
export function revalidateThemeLists(): void {
  revalidatePath("/themes");
  revalidatePath("/themes/active");
  revalidatePath("/themes/tag/[tag]", "page");
  revalidatePath("/themes/tag/[tag]/all", "page");
}
