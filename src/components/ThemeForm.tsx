"use client";

import { useActionState, useEffect, useState } from "react";
import Script from "next/script";
import { createThemeAction, type FormState } from "@/app/actions";
import { AiSeedAssist } from "@/components/AiSeedAssist";

declare global {
  interface Window {
    turnstile?: { reset: () => void };
  }
}

export function ThemeForm({ siteKey }: { siteKey: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createThemeAction,
    {},
  );
  // Server Action完了後にReactがフォームを自動リセットするため、
  // エラー時に入力が消えないよう値をstateで保持する
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [seeds, setSeeds] = useState("");

  // Turnstileのトークンは使い捨て+5分で失効するため、
  // エラーで差し戻されたらウィジェットをリセットして新しいトークンを取り直す
  useEffect(() => {
    if (state.error) window.turnstile?.reset();
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
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
          value={title}
          onChange={(e) => setTitle(e.target.value)}
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
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-md border border-stone-500 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900"
        />
      </div>
      <div>
        <div className="mb-1 flex flex-wrap items-end justify-between gap-2">
          <label htmlFor="seeds" className="block text-sm font-medium">
            最初の意見(1行に1つ、2〜10個)
          </label>
          <AiSeedAssist
            title={title}
            description={description}
            onGenerated={(lines) =>
              setSeeds((prev) => (prev.trim() ? prev.trimEnd() + "\n" : "") + lines.join("\n"))
            }
          />
        </div>
        <textarea
          id="seeds"
          name="seeds"
          required
          rows={5}
          placeholder={"PvPは事前の同意があれば問題ない\nGMが介入して止めるべきだ"}
          value={seeds}
          onChange={(e) => setSeeds(e.target.value)}
          className="w-full rounded-md border border-stone-500 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900"
        />
        <p className="mt-1 text-xs text-stone-600 dark:text-stone-500">
          賛成/反対が分かれそうな意見を並べておくと、参加者が投票しやすくなります
        </p>
      </div>
      <div className="cf-turnstile" data-sitekey={siteKey} data-refresh-expired="auto" />
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
