"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ThemeCard } from "./ThemeCard";
import type { ThemeWithCounts } from "@/lib/queries";
import { loadMoreThemes, type ThemesTab } from "@/app/themes/actions";

// スクロール到達で次ページを追記する無限スクロール一覧(Twitter/YouTube風)。
// 初回分はサーバーで描画済みのものを initialItems で受け取る。
export function ThemeInfiniteList({
  tab,
  initialItems,
  pageSize,
}: {
  tab: ThemesTab;
  initialItems: ThemeWithCounts[];
  pageSize: number;
}) {
  const [items, setItems] = useState<ThemeWithCounts[]>(initialItems);
  const [hasMore, setHasMore] = useState(initialItems.length === pageSize);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const next = await loadMoreThemes(tab, items.length);
      setItems((prev) => [...prev, ...next]);
      if (next.length < pageSize) setHasMore(false);
    } catch {
      // 失敗しても状態は保持し、次のスクロールで再試行できるようにする
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, tab, items.length, pageSize]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    // 画面下端の少し手前で先読みする
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, hasMore]);

  return (
    <div className="flex flex-col gap-3">
      {items.map((t) => (
        <ThemeCard key={t.id} theme={t} />
      ))}
      {hasMore && <div ref={sentinelRef} aria-hidden className="h-1" />}
      {loading && (
        <p className="py-4 text-center text-sm text-stone-500">読み込み中…</p>
      )}
      {!hasMore && items.length > 0 && (
        <p className="py-4 text-center text-xs text-stone-500">すべて表示しました</p>
      )}
    </div>
  );
}
