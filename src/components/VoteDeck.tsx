"use client";

import { useEffect, useState, useTransition } from "react";
import { castVoteAction } from "@/app/actions";
import { usePersonalization } from "./ThemePersonalization";

type Statement = { id: number; text: string };

// 偏りを避けるためのFisher-Yatesシャッフル(元のサーバー側 random() 相当)
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 投票デッキ。テーマの全意見を受け取り、自分が未投票のぶんを(個人化の読み込み完了時に
// 一度だけ)シャッフルして順に出す。自分の投票状態は ThemePersonalization から取得する。
export function VoteDeck({ themeId, statements }: { themeId: string; statements: Statement[] }) {
  const { votes, loaded, setVote } = usePersonalization();
  const total = statements.length;

  const [deck, setDeck] = useState<Statement[] | null>(null);
  const [index, setIndex] = useState(0);
  const [passStreak, setPassStreak] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 個人化の読み込み完了時に、未投票の意見をスナップショット＋シャッフルして固定する。
  useEffect(() => {
    if (loaded && deck === null) {
      setDeck(shuffle(statements.filter((s) => !(s.id in votes))));
    }
  }, [loaded, deck, statements, votes]);

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

  // 個人化(自分の投票)の読み込み待ち。誤って投票済みの意見を出さないよう待つ。
  if (deck === null) {
    return (
      <div className="rounded-lg border border-stone-400 bg-white p-6 text-center text-sm text-stone-500 dark:border-stone-800 dark:bg-stone-900">
        読み込み中…
      </div>
    );
  }

  const current = deck[index];
  const done = index >= deck.length;
  const votedCount = Object.keys(votes).length;

  function vote(value: number) {
    if (!current || pending) return;
    startTransition(async () => {
      const res = await castVoteAction(themeId, current.id, value);
      if (!res.ok) {
        // レート制限などで拒否された票は反映せず、カードも進めない
        setError(res.error ?? "投票できませんでした。時間を置いて再読み込みしてください");
        return;
      }
      setError(null);
      setVote(current.id, value);
      // パスが続いている=既存の意見がしっくり来ていないサインなので、投稿を提案する
      setPassStreak(value === 0 ? passStreak + 1 : 0);
      setIndex((i) => i + 1);
    });
  }

  if (done) {
    return (
      <p className="rounded-lg border border-stone-400 bg-white p-6 text-center text-sm text-stone-700 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300">
        このテーマの意見にはすべて投票しました。
        <br />
        あなたの投票は下の意見マップに反映されます。新しい意見が増えれば、続けて投票できます。
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-stone-400 bg-white p-6 dark:border-stone-800 dark:bg-stone-900">
      <p className="mb-2 text-xs text-stone-500 dark:text-stone-500">
        意見 {index + 1} / {deck.length}
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
      {error && (
        <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-center text-sm text-rose-700">
          {error}
        </p>
      )}
      <p className="mt-3 text-center text-xs text-stone-500">
        {votedCount}件に投票済み · 直感でどんどん答えてOK。
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
