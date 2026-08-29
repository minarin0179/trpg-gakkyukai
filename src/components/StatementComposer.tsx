import type { ReactNode } from "react";

// 意見を投稿しない人にとっての情報量を減らすため、投稿欄は既定で折りたたむ。
// 一般的なディスクロージャ(アコーディオン)パターン: 同じヘッダーが開閉を兼ね、
// シェブロンの向きで開閉状態を示す。ネイティブ <details> なのでJS不要・
// アクセシブルで、折りたたんでもフォームの入力内容はDOMに残り消えない。
// children にはサーバー側で StatementGuidelines と StatementForm を渡す。
export function StatementComposer({ children }: { children: ReactNode }) {
  return (
    <details className="group rounded-md border border-stone-500 dark:border-stone-700">
      <summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 rounded-md px-4 py-2.5 text-sm font-medium text-stone-700 marker:content-none hover:bg-stone-50 [&::-webkit-details-marker]:hidden dark:text-stone-300 dark:hover:bg-stone-800/50">
        <span className="group-open:hidden">意見を投稿する</span>
        <span className="hidden group-open:inline">閉じる</span>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
          className="hidden h-4 w-4 shrink-0 text-stone-500 transition-transform duration-200 group-open:block group-open:rotate-180"
        >
          <path
            d="M6 8l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>
      <div className="border-t border-stone-300 px-4 py-3 dark:border-stone-700">{children}</div>
    </details>
  );
}
