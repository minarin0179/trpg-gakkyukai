"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { createStatementAction } from "@/app/actions/statements";
import { type FormState } from "@/lib/action-result";
import { STATEMENT_MAX } from "@/lib/config";

export function StatementForm({ themeId }: { themeId: string }) {
  const [text, setText] = useState("");
  const [justPosted, setJustPosted] = useState(false);
  const router = useRouter();
  // 投稿成功時のみ入力をクリア(エラー時は保持)し、投票への誘導を出す。
  // あわせてサーバーコンポーネントを再取得し、投稿した意見がリロードなしで
  // 投票デッキ・意見一覧に現れるようにする。
  // 副作用はeffectではなくアクション側に置く(成功したときだけ・1回だけ走らせたいため)
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      const result = await createStatementAction(prev, formData);
      if (result.done) {
        setText("");
        setJustPosted(true);
        router.refresh();
      }
      return result;
    },
    {},
  );

  return (
    // 投稿は編集・削除できないため、送信前にブラウザの確認ダイアログを挟む
    // (要望テーマの方針。Server Actionでもsubmitイベントは先に発火する)
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm("投稿後の編集・削除はできません。この内容で投稿しますか?")) {
          e.preventDefault();
        }
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="themeId" value={themeId} />
      <textarea
        name="text"
        required
        minLength={2}
        maxLength={STATEMENT_MAX}
        rows={2}
        placeholder={`あなたの意見(${STATEMENT_MAX}文字まで)`}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (justPosted) setJustPosted(false);
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
      <button
        type="submit"
        disabled={pending}
        className="self-end rounded-md bg-stone-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
      >
        {pending ? "投稿中..." : "意見を投稿"}
      </button>
    </form>
  );
}
