"use client";

import { useState, useTransition } from "react";
import { castVoteAction } from "@/app/actions";
import { ReportButton } from "./ReportButton";
import { usePersonalization } from "./ThemePersonalization";

type S = { id: number; text: string };

const OPTIONS: { v: number; label: string; on: string }[] = [
  { v: 1, label: "賛成", on: "bg-emerald-600 text-white" },
  { v: 0, label: "パス", on: "bg-stone-400 text-white" },
  { v: -1, label: "反対", on: "bg-rose-600 text-white" },
];

// すべての意見の一覧。各意見に「自分の現在の投票」を表示し、その場で押し直せる(訂正)。
// 自分の投票状態は ThemePersonalization から取得・更新する(投票デッキと即時に同期)。
export function StatementList({ themeId, statements }: { themeId: string; statements: S[] }) {
  const { votes, setVote } = usePersonalization();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  function change(statementId: number, value: number) {
    if (votes[statementId] === value || pendingId !== null) return;
    setVote(statementId, value); // 楽観的更新(デッキ側にも即反映)
    setPendingId(statementId);
    startTransition(async () => {
      try {
        await castVoteAction(themeId, statementId, value);
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <ul className="flex flex-col gap-2">
      {statements.map((s) => {
        const cur = votes[s.id];
        return (
          <li
            key={s.id}
            className="rounded-md border border-stone-400 bg-white px-3 py-2 text-sm dark:border-stone-800 dark:bg-stone-900"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0">{s.text}</span>
              <ReportButton targetType="statement" targetId={String(s.id)} />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="inline-flex overflow-hidden rounded-md border border-stone-300 dark:border-stone-700">
                {OPTIONS.map((o) => (
                  <button
                    key={o.v}
                    onClick={() => change(s.id, o.v)}
                    disabled={pendingId === s.id}
                    className={`px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
                      cur === o.v
                        ? o.on
                        : "text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {cur === undefined && <span className="text-xs text-stone-500">未回答</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
