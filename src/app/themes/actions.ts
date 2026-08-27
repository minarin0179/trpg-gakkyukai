"use server";

import { listThemesPage, type ThemeWithCounts } from "@/lib/queries";

// 無限スクロールの追加読み込み。クライアントから offset を渡して次ページを取得する。
export async function loadMoreThemes(
  tab: "fresh" | "active",
  offset: number,
): Promise<ThemeWithCounts[]> {
  const safeOffset = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
  return listThemesPage(tab, safeOffset);
}
