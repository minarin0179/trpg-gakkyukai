"use client";

import { useActionState, useEffect, useRef } from "react";
import { createStatementAction, type FormState } from "@/app/actions";

export function StatementForm({ themeId }: { themeId: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createStatementAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state.error) formRef.current?.reset();
  }, [pending, state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="themeId" value={themeId} />
      <textarea
        name="text"
        required
        minLength={2}
        maxLength={280}
        rows={2}
        placeholder="あなたの意見(280文字まで)。賛成でも反対でもない新しい視点も歓迎"
        className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900"
      />
      {state.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
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
