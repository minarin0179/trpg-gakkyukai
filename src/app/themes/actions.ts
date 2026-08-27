"use server";

import { listThemesForTab, type ThemeWithCounts, type ThemesTab } from "@/lib/queries";
import { getParticipantId } from "@/lib/participant";

export type { ThemesTab } from "@/lib/queries";

// 無限スクロールの追加読み込み。クライアントから offset を渡して次ページを取得する。
// 参加者(cookie)はサーバー側で解決し、参加済み/未読/未回答数などの算出に使う。
export async function loadMoreThemes(
  tab: ThemesTab,
  offset: number,
): Promise<ThemeWithCounts[]> {
  const safeOffset = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
  return listThemesForTab(tab, await getParticipantId(), safeOffset);
}
