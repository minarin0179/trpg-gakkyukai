"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { createThemeAction, type FormState } from "@/app/actions";
import { AiSeedAssist } from "@/components/AiSeedAssist";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
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

  const widgetIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Turnstileを明示的にレンダリングし、widget idを保持する。
  // 暗黙レンダリング(class="cf-turnstile")は、クライアント遷移や再レンダリングで
  // ウィジェットが重複・孤児化し「Cannot find Widget」等の原因になるため使わない。
  useEffect(() => {
    let cancelled = false;
    let iv: ReturnType<typeof setInterval> | undefined;
    const tryRender = (): boolean => {
      if (cancelled) return true;
      const ts = window.turnstile;
      if (ts && containerRef.current && widgetIdRef.current === null) {
        try {
          widgetIdRef.current = ts.render(containerRef.current, {
            sitekey: siteKey,
            "refresh-expired": "auto",
          });
        } catch {
          // レンダリング競合時は次のtickで再試行
        }
      }
      return widgetIdRef.current !== null;
    };
    if (!tryRender()) {
      // api.js の読み込み完了を待ってから描画する
      iv = setInterval(() => {
        if (tryRender() && iv) clearInterval(iv);
      }, 200);
    }
    return () => {
      cancelled = true;
      if (iv) clearInterval(iv);
      if (widgetIdRef.current !== null) {
        try {
          window.turnstile?.remove(widgetIdRef.current);
        } catch {
          // 既に除去済みなら無視
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  // Turnstileのトークンは使い捨て+5分で失効するため、
  // エラーで差し戻されたら「そのウィジェットだけ」リセットして新しいトークンを取り直す
  useEffect(() => {
    if (state.error && widgetIdRef.current !== null) {
      try {
        window.turnstile?.reset(widgetIdRef.current);
      } catch {
        // ウィジェットが無ければ何もしない
      }
    }
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        async
        defer
      />
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
          placeholder="賛否が分かれそうな問いを書く"
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
          placeholder={"このテーマに賛成する人・反対する人、それぞれの言い分を想像して1行ずつ書く"}
          value={seeds}
          onChange={(e) => setSeeds(e.target.value)}
          className="w-full rounded-md border border-stone-500 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900"
        />
        <p className="mt-1 text-xs text-stone-600 dark:text-stone-500">
          賛成/反対が分かれそうな意見を並べておくと、参加者が投票しやすくなります
        </p>
      </div>
      <div ref={containerRef} />
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
        10人が投票すると人気タブにも表示されます。
      </p>
    </form>
  );
}
