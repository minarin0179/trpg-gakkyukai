"use client";

import { useState, type ReactNode } from "react";
import { usePersonalization } from "./ThemePersonalization";
import { STATEMENT_GATE_VOTES } from "@/lib/config";

// 意見を投稿しない人にとっての情報量を減らすため、投稿欄は既定で折りたたむ。
// 一般的なディスクロージャ(アコーディオン)パターン: 同じヘッダーが開閉を兼ね、
// シェブロンの向きで開閉状態を示す。ネイティブ <details> なのでアクセシブルで、
// 折りたたんでもフォームの入力内容はDOMに残り消えない。
// children にはサーバー側で StatementGuidelines と StatementForm を渡す。
//
// 投票ゲート: min(5, 意見数) 件投票するまでは、ヘッダーを押しても展開せず
// 案内だけを表示する。投票状況は ThemePersonalization からリアルタイムに取れる
// ので、デッキで5件投票した瞬間から普通に開けるようになる(サーバー側でも
// createStatementAction が同条件を検証している)
//
// クリックの横取りは見出し(summary)に限る。以前は <details> 内の全クリックを
// 止めていたため、投票状況の読み込み前に開いた投稿欄で、読み込み後にゲート未達と
// 判定されると送信ボタンのクリックまで無言で握りつぶされていた
// (iPhone Safari で「投稿ボタンが動かない」通報の最有力原因)。開いたあとで
// ゲート未達になった場合は、送信を止めずに案内を出して理由が分かるようにする
export function StatementComposer({
  statementCount,
  children,
}: {
  statementCount: number;
  children: ReactNode;
}) {
  const { votes, loaded } = usePersonalization();
  const [showGateNotice, setShowGateNotice] = useState(false);
  const [open, setOpen] = useState(false);

  const votedCount = Object.keys(votes).length;
  const required = Math.min(STATEMENT_GATE_VOTES, statementCount);
  const remaining = Math.max(0, required - votedCount);
  const locked = loaded && remaining > 0;

  return (
    <div>
      <details
        className="group rounded-md border border-stone-500"
        onToggle={(e) => setOpen(e.currentTarget.open)}
        onClick={(e) => {
          if (locked && (e.target as HTMLElement).closest("summary")) {
            e.preventDefault(); // 展開せず案内だけ出す
            setShowGateNotice(true);
          }
        }}
      >
        <summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 rounded-md px-4 py-2.5 text-sm font-medium text-stone-700 marker:content-none hover:bg-stone-50 [&::-webkit-details-marker]:hidden">
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
        <div className="border-t border-stone-300 px-4 py-3">{children}</div>
      </details>
      {locked && (showGateNotice || open) && (
        <div
          aria-live="polite"
          className="mt-2 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm"
        >
          <p className="font-medium">まずはほかの人の意見に投票してみませんか?</p>
          <p className="mt-1 text-xs text-stone-600">
            あと{remaining}件投票すると、意見を投稿できます({votedCount}/{required})。
          </p>
        </div>
      )}
    </div>
  );
}
