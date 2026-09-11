"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ThemeCard } from "./ThemeCard";
import type { ThemeWithCounts } from "@/lib/queries";
import { loadMoreThemes, type ThemesTab } from "@/app/themes/actions";
import { useHiddenThemes, hideTheme, unhideTheme } from "@/lib/hidden-themes";

// スクロール到達で次ページを追記する無限スクロール一覧(Twitter/YouTube風)。
// 初回分はサーバーで描画済みのものを initialItems で受け取る。
export function ThemeInfiniteList({
  tab,
  initialItems,
  pageSize,
  query,
  tag,
  tagMode,
}: {
  tab: ThemesTab;
  initialItems: ThemeWithCounts[];
  pageSize: number;
  query?: string;
  tag?: string;
  tagMode?: "and" | "or";
}) {
  const [items, setItems] = useState<ThemeWithCounts[]>(initialItems);
  // 自分が「非表示」にしたテーマ(端末内の設定)。取得結果から除外して描く。
  // サーバー描画時は空なので、非表示のカードはハイドレーション直後に消える
  const hidden = useHiddenThemes();
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
      const next = await loadMoreThemes(
        tab,
        offsetRef.current,
        query,
        tag,
        tagMode,
      );
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
  }, [loading, hasMore, tab, pageSize, query, tag, tagMode]);

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

  const hiddenIds = new Set(hidden.map((h) => h.id));
  const visible = hiddenIds.size
    ? items.filter((t) => !hiddenIds.has(t.id))
    : items;

  return (
    <div className="flex flex-col gap-3">
      {visible.map((t) => (
        <ThemeCard key={t.id} theme={t} onHide={() => hideTheme(t)} />
      ))}
      {hasMore && <div ref={sentinelRef} aria-hidden className="h-1" />}
      {loading && (
        <p className="py-4 text-center text-sm text-stone-500">読み込み中…</p>
      )}
      {!hasMore && items.length > 0 && (
        <p className="py-4 text-center text-xs text-stone-500">
          すべて表示しました
        </p>
      )}
      {hidden.length > 0 && (
        // 非表示にしたテーマの一覧と戻す導線。目立たせないが、必ず辿れる場所に置く
        <details className="text-xs text-stone-500">
          <summary className="cursor-pointer list-none text-center underline decoration-stone-400 underline-offset-2 marker:content-none hover:text-stone-700 [&::-webkit-details-marker]:hidden">
            非表示にしたテーマ {hidden.length}件
          </summary>
          <ul className="mt-2 flex flex-col gap-1 rounded-md border border-stone-300 bg-white px-3 py-2">
            {hidden.map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between gap-3"
              >
                <span className="min-w-0 truncate text-stone-700">
                  {h.title}
                </span>
                <button
                  type="button"
                  onClick={() => unhideTheme(h.id)}
                  className="shrink-0 underline hover:text-stone-800"
                >
                  表示する
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
