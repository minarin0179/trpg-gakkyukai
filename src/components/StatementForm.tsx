"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createStatementAction, type FormState } from "@/app/actions";

export function StatementForm({ themeId }: { themeId: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createStatementAction,
    {},
  );
  const [text, setText] = useState("");
  const [justPosted, setJustPosted] = useState(false);
  // 投稿は編集・削除できないため、送信前にワンクッション置く(要望テーマの方針)。
  // 1回目のクリックで確認表示に切り替わり、2回目で実際に送信される
  const [confirming, setConfirming] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  // 投稿成功時のみ入力をクリア(エラー時は保持)し、投票への誘導を出す。
  // あわせてサーバーコンポーネントを再取得し、投稿した意見がリロードなしで
  // 投票デッキ・意見一覧に現れるようにする
  useEffect(() => {
    if (state.done) {
      setText("");
      setJustPosted(true);
      setConfirming(false);
      router.refresh();
    }
  }, [state, router]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="themeId" value={themeId} />
      <textarea
        name="text"
        required
        minLength={2}
        maxLength={140}
        rows={2}
        placeholder="あなたの意見(140文字まで)"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (justPosted) setJustPosted(false);
          if (confirming) setConfirming(false); // 内容を変えたら確認をやり直す
        }}
        className="w-full rounded-md border border-stone-500 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900"
      />
      {state.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      {justPosted && (
        // 投稿直後はエンゲージメントが高い。この瞬間に投票へ橋渡しする
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          投稿しました。ほかの人の意見にも
          <button
            type="button"
            onClick={() => document.getElementById("vote")?.scrollIntoView({ behavior: "smooth" })}
            className="font-medium underline"
          >
            投票してみませんか?
          </button>
          投票が集まると意見マップがはっきりしていきます。
        </p>
      )}
      {confirming && (
        <p className="self-end text-xs text-stone-600 dark:text-stone-400">
          投稿後の編集・削除はできません。内容を確認してください。
        </p>
      )}
      {/* typeは常にbuttonのまま、確認済みのときだけ明示的に送信する。
          クリックハンドラ内でtypeをsubmitへ切り替えると、その同じクリックの
          デフォルト動作として即座に送信されてしまう(確認が機能しない)ため */}
      <button
        type="button"
        onClick={() => {
          if (confirming) formRef.current?.requestSubmit();
          else setConfirming(true);
        }}
        disabled={pending || text.trim().length < 2}
        className="self-end rounded-md bg-stone-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
      >
        {pending ? "投稿中..." : confirming ? "この内容で投稿する" : "意見を投稿"}
      </button>
    </form>
  );
}
