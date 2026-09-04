"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { castVoteAction } from "@/app/actions/statements";
import { suggestNextThemeAction } from "@/app/actions/themes";
import type { NextThemeSuggestion } from "@/lib/queries";
import { ReportButton } from "./ReportButton";
import { usePersonalization } from "./ThemePersonalization";
import { weightedShuffle } from "@/lib/weighted-shuffle";

type Statement = { id: number; text: string };

// 投票デッキ。テーマの全意見を受け取り、自分が未投票のぶんを(個人化の読み込み完了時に
// 一度だけ)priority重み付き抽選で並べて順に出す(計算前のテーマは一様ランダム)。
// 自分の投票状態は ThemePersonalization から取得する。
export function VoteDeck({
  themeId,
  statements,
  priorities = null,
}: {
  themeId: string;
  statements: Statement[];
  priorities?: Record<string, number> | null;
}) {
  const { votes, loaded, setVote } = usePersonalization();
  const total = statements.length;

  const [index, setIndex] = useState(0);
  const [passStreak, setPassStreak] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 個人化の読み込み完了時に、未投票の意見をスナップショット＋シャッフルして固定する。
  // 依存は loaded だけにする。以後 votes(自分の投票)が増えても並べ直さず、
  // 表示中のカードが入れ替わらないようにするため(意図的な依存の省略)。
  // weightedShuffle は Math.random を使うが、サーバー側では loaded=false なので走らない。
  const deck = useMemo(
    () =>
      loaded
        ? weightedShuffle(
            statements.filter((s) => !(s.id in votes)),
            priorities,
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loaded],
  );

  function scrollToPost() {
    document.getElementById("post")?.scrollIntoView({ behavior: "smooth" });
  }

  if (total === 0) {
    return (
      <p className="rounded-lg border border-dashed border-stone-500 p-6 text-center text-sm text-stone-600">
        まだ意見がありません。最初の意見を投稿してみてください。
      </p>
    );
  }

  // 個人化(自分の投票)の読み込み待ち。誤って投票済みの意見を出さないよう待つ。
  if (deck === null) {
    return (
      <div className="rounded-lg border border-stone-400 bg-white p-6 text-center text-sm text-stone-500">
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
        setError(res.error);
        return;
      }
      setError(null);
      setVote(current.id, value);
      // パスが続いている=既存の意見がしっくり来ていないサインなので、投稿を提案する
      // 直前のレンダー時の値ではなく最新値から数える(連投で取りこぼさない)
      setPassStreak((n) => (value === 0 ? n + 1 : 0));
      setIndex((i) => i + 1);
    });
  }

  if (done) {
    return (
      <div className="flex flex-col gap-3">
        <p className="rounded-lg border border-stone-400 bg-white p-6 text-center text-sm text-stone-700">
          このテーマの意見にはすべて投票しました。
          <br />
          あなたの投票は下の意見マップに反映されます。新しい意見が増えれば、続けて投票できます。
        </p>
        <NextThemeCard themeId={themeId} />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-stone-400 bg-white p-6">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-stone-500">
          意見 {index + 1} / {deck.length}
        </p>
        {/* 通報が完了したらこの意見はパス扱いで次へ(要望#4738)。
            key で意見ごとにフォーム状態をリセットする */}
        <ReportButton
          key={current.id}
          targetType="statement"
          targetId={String(current.id)}
          onDone={() => vote(0)}
        />
      </div>
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
          className="rounded-md bg-stone-200 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-300 disabled:opacity-50"
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
        {votedCount}件に投票済み · 直感で答えてOK。前提に賛成できない意見や答えにくい意見はパスで構いません。
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

// 投票を終えた人に「次のテーマ」を1件だけ出す。ここで一覧へ戻さずに次へ送ることが
// 離脱を防ぐ要になるため、デッキ完了時にだけサーバーアクションを1回呼ぶ。
// 取得に失敗した場合・候補が無い場合は、一覧への導線だけを残す
function NextThemeCard({ themeId }: { themeId: string }) {
  const [next, setNext] = useState<NextThemeSuggestion | null>(null);

  useEffect(() => {
    // アンマウント後にstateを触らないためのキャンセル判定(LiveVoterCountと同じ形)
    let aborted = false;
    suggestNextThemeAction(themeId)
      .then((res) => {
        if (!aborted && res.ok) setNext(res.data);
      })
      .catch(() => {});
    return () => {
      aborted = true;
    };
  }, [themeId]);

  return (
    <div className="rounded-lg border border-stone-400 bg-white p-4">
      {next && (
        <>
          <p className="text-xs text-stone-500">次のテーマ</p>
          {/* 一覧カードと同じ理由で先読みしない(遷移先はISRキャッシュ済み) */}
          <Link
            prefetch={false}
            href={`/t/${next.id}`}
            className="mt-1 block font-semibold underline decoration-stone-400 underline-offset-2 hover:decoration-stone-900"
          >
            {next.title}
          </Link>
          <p className="mt-1 text-xs text-stone-600">
            {next.voterCount}人が投票 · 意見{next.statementCount}件
          </p>
        </>
      )}
      <p className={next ? "mt-3 text-xs" : "text-center text-xs"}>
        <Link prefetch={false} href="/themes?tab=unread" className="text-stone-600 underline">
          ほかのテーマを見る
        </Link>
      </p>
    </div>
  );
}
