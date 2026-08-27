"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { castVoteAction } from "@/app/actions";

type Statement = { id: number; text: string };

export function VoteDeck({
  themeId,
  statements,
  total,
  alreadyVoted,
  mapThreshold,
}: {
  themeId: string;
  statements: Statement[];
  total: number; // このテーマの可視の意見の総数(未投票が0でも「意見なし」と「全投票済み」を区別する)
  alreadyVoted: number; // この参加者がこのテーマで既に投票済みの数(再訪時の加算表示用)
  mapThreshold: number; // マップに自分が載るのに必要な投票数(Polisの7票ルール等)
}) {
  const [index, setIndex] = useState(0);
  const [voted, setVoted] = useState(alreadyVoted); // 累計投票数(このセッション+過去)
  const [passStreak, setPassStreak] = useState(0);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const current = statements[index];
  const done = index >= statements.length;
  const remainingForMap = Math.max(0, mapThreshold - voted);

  function vote(value: number) {
    if (!current || pending) return;
    startTransition(async () => {
      await castVoteAction(themeId, current.id, value);
      setVoted((v) => v + 1);
      // パスが続いている=既存の意見がしっくり来ていないサインなので、投稿を提案する
      setPassStreak(value === 0 ? passStreak + 1 : 0);
      const next = index + 1;
      setIndex(next);
      if (next >= statements.length) {
        router.refresh(); // マップと意見一覧を最新化
      }
    });
  }

  function scrollToPost() {
    document.getElementById("post")?.scrollIntoView({ behavior: "smooth" });
  }

  if (total === 0) {
    return (
      <p className="rounded-lg border border-dashed border-stone-500 p-6 text-center text-sm text-stone-600 dark:border-stone-700 dark:text-stone-500">
        まだ意見がありません。最初の意見を投稿してみてください。
      </p>
    );
  }

  if (statements.length === 0 || done) {
    return (
      <p className="rounded-lg border border-stone-400 bg-white p-6 text-center text-sm text-stone-700 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300">
        このテーマの意見にはすべて投票しました。
        <br />
        {remainingForMap > 0 ? (
          <>まだ意見が増えれば、続けて投票できます。結果は下の意見マップへ。</>
        ) : (
          <>あなたの点は意見マップに反映されています。結果は下のマップへ。</>
        )}
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-stone-400 bg-white p-6 dark:border-stone-800 dark:bg-stone-900">
      <p className="mb-2 text-xs text-stone-500 dark:text-stone-500">
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
      <p className="mt-3 text-center text-xs text-stone-500">
        {voted}件に投票済み
        {remainingForMap > 0 ? `(あと${remainingForMap}票でマップに載ります)` : "(マップに反映済み)"}
        {" · "}
        <button
          onClick={() => document.getElementById("map")?.scrollIntoView({ behavior: "smooth" })}
          className="underline"
        >
          ここまでの結果を見る
        </button>
      </p>
      {passStreak >= 3 && (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-stone-700">
          パスが続いていますね。どの意見もしっくり来ないなら、
          <button onClick={scrollToPost} className="font-medium underline">
            あなたの意見を投稿
          </button>
          してみませんか? それも立派な参加です。
        </p>
      )}
    </div>
  );
}
