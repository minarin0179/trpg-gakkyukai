"use server";

import {
  listThemesPage,
  listParticipatedPage,
  type ThemeWithCounts,
} from "@/lib/queries";
import { getParticipantId } from "@/lib/participant";

export type ThemesTab = "fresh" | "active" | "mine";

// 無限スクロールの追加読み込み。クライアントから offset を渡して次ページを取得する。
// 参加済み(mine)の participantId はクライアントから受け取らず、サーバー側のcookieで解決する。
export async function loadMoreThemes(
  tab: ThemesTab,
  offset: number,
): Promise<ThemeWithCounts[]> {
  const safeOffset = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
  if (tab === "mine") {
    return listParticipatedPage(await getParticipantId(), safeOffset);
  }
  return listThemesPage(tab, safeOffset);
}
