"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { castVoteAction } from "@/app/actions";

type Statement = { id: number; text: string };

export function VoteDeck({
  themeId,
  statements,
}: {
  themeId: string;
  statements: Statement[];
}) {
  const [index, setIndex] = useState(0);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const current = statements[index];
  const done = index >= statements.length;

  function vote(value: number) {
    if (!current || pending) return;
    startTransition(async () => {
      await castVoteAction(themeId, current.id, value);
      const next = index + 1;
      setIndex(next);
      if (next >= statements.length) {
        router.refresh(); // マップと意見一覧を最新化
      }
    });
  }

  if (statements.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">
        まだ意見がありません。最初の意見を投稿してみてください。
      </p>
    );
  }

  if (done) {
    return (
      <p className="rounded-lg border border-stone-200 bg-white p-6 text-center text-sm text-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300">
        すべての意見に投票しました 🎉
        <br />
        言い足りないことがあれば、下から新しい意見を投稿できます。
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900">
      <p className="mb-1 text-xs text-stone-500 dark:text-stone-400">
        意見 {index + 1} / {statements.length}
      </p>
      <p className="min-h-16 text-base leading-relaxed">{current.text}</p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <button
          onClick={() => vote(1)}
          disabled={pending}
          className="rounded-md bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          賛成
        </button>
        <button
          onClick={() => vote(0)}
          disabled={pending}
          className="rounded-md bg-stone-200 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-300 disabled:opacity-50 dark:bg-stone-700 dark:text-stone-200 dark:hover:bg-stone-600"
        >
          パス / わからない
        </button>
        <button
          onClick={() => vote(-1)}
          disabled={pending}
          className="rounded-md bg-rose-600 py-2.5 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50"
        >
          反対
        </button>
      </div>
    </div>
  );
}
