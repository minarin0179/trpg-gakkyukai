"use client";

import { useActionState } from "react";
import Script from "next/script";
import { createThemeAction, type FormState } from "@/app/actions";

export function ThemeForm({ siteKey }: { siteKey: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createThemeAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Script src="https://challenges.cloudflare.com/turnstile/api.js" async defer />
      <div>
        <label htmlFor="title" className="mb-1 block text-sm font-medium">
          テーマ(問いの形にすると議論しやすくなります)
        </label>
        <input
          id="title"
          name="title"
          required
          minLength={5}
          maxLength={100}
          placeholder="例: セッション中のPC間対立はどこまで許容されるべき?"
          className="w-full rounded-md border border-stone-500 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900"
        />
      </div>
      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium">
          説明(任意)
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          maxLength={2000}
          placeholder="背景や論点の補足があれば"
          className="w-full rounded-md border border-stone-500 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900"
        />
      </div>
      <div>
        <label htmlFor="seeds" className="mb-1 block text-sm font-medium">
          最初の意見(1行に1つ、2〜10個)
        </label>
        <textarea
          id="seeds"
          name="seeds"
          required
          rows={5}
          placeholder={"PvPは事前の同意があれば問題ない\nGMが介入して止めるべきだ"}
          className="w-full rounded-md border border-stone-500 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900"
        />
        <p className="mt-1 text-xs text-stone-600 dark:text-stone-500">
          賛成/反対が分かれそうな意見を並べておくと、参加者が投票しやすくなります
        </p>
      </div>
      <div className="cf-turnstile" data-sitekey={siteKey} />
      {state.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
      >
        {pending ? "作成中..." : "テーマを公開する"}
      </button>
      <p className="text-xs text-stone-600 dark:text-stone-500">
        テーマは審査なしで即時公開されます。まず新着タブに載り、
        10人が投票するとメインの一覧に表示されます。
      </p>
    </form>
  );
}
