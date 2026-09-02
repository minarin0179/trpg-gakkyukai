import { revalidatePath } from "next/cache";

// テーマに紐づくISRページをまとめて無効化する。/t/[id]/report(ISR 300s)を
// 忘れると、削除した意見が最大5分レポートに残る
export function revalidateTheme(themeId: string): void {
  revalidatePath(`/t/${themeId}`);
  revalidatePath(`/t/${themeId}/report`);
}
