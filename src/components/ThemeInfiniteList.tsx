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
  query,
}: {
  tab: ThemesTab;
  initialItems: ThemeWithCounts[];
  pageSize: number;
  query?: string;
}) {
  const [items, setItems] = useState<ThemeWithCounts[]>(initialItems);
  const [hasMore, setHasMore] = useState(initialItems.length === pageSize);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // 取得済み件数。items.length ではなく実取得数で進めることで、
  // 取得の合間にデータが変動しても offset が正しく前進する。
  const offsetRef = useRef(initialItems.length);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const next = await loadMoreThemes(tab, offsetRef.current, query);
      offsetRef.current += next.length;
      // 取得の合間に先頭へ新テーマが増えると offset がずれて境界の項目が
      // 重複し得るため、id で重複除去してから追記する(key重複・二重表示を防ぐ)。
      setItems((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...next.filter((t) => !seen.has(t.id))];
      });
      if (next.length < pageSize) setHasMore(false);
    } catch {
      // 失敗しても状態は保持し、次のスクロールで再試行できるようにする
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, tab, pageSize, query]);

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
