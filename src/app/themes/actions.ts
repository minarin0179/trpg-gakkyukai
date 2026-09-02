"use server";

import { listThemesForTab, THEME_TABS, type ThemeWithCounts, type ThemesTab } from "@/lib/queries";
import { getParticipantId } from "@/lib/participant";

export type { ThemesTab } from "@/lib/queries";

// 無限スクロールの追加読み込み。クライアントから offset を渡して次ページを取得する。
// 参加者(cookie)はサーバー側で解決し、参加済み/未参加/未回答数などの算出に使う。
export async function loadMoreThemes(
  tab: ThemesTab,
  offset: number,
  query?: string,
  tag?: string,
  tagMode?: "and" | "or",
): Promise<ThemeWithCounts[]> {
  // tabはクライアント由来。型注釈はコンパイル時のみで実行時の保証にならないため照合する
  if (!(THEME_TABS as readonly string[]).includes(tab)) return [];
  const safeOffset = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
  const q = typeof query === "string" ? query.slice(0, 100) : undefined;
  const t = typeof tag === "string" ? tag.slice(0, 200) : undefined;
  const m = tagMode === "and" ? "and" : "or";
  return listThemesForTab(tab, await getParticipantId(), safeOffset, undefined, q, t, m);
}
