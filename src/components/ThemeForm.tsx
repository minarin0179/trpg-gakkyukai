"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { createThemeAction, findSimilarThemesAction, type FormState } from "@/app/actions";
import { AiSeedAssist } from "@/components/AiSeedAssist";
import { SEED_STATEMENTS_MAX } from "@/lib/config";

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

  // 入力中のライブ類似チェック(入力600ms停止またはフォーカスが外れたら実行)。
  // 類似テーマは「表示して合流を促す」のみで、送信を差し止めるゲートは設けない
  const [liveSimilar, setLiveSimilar] = useState<{ id: string; title: string }[] | null>(null);
  const [checking, setChecking] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkSeqRef = useRef(0); // 古いレスポンスで新しい入力の結果を上書きしない

  async function runSimilarCheck(value: string) {
    const seq = ++checkSeqRef.current;
    setChecking(true);
    try {
      const found = await findSimilarThemesAction(value);
      if (checkSeqRef.current === seq) setLiveSimilar(found);
    } catch {
      // ライブチェックは補助機能。失敗しても何も出さない
    } finally {
      if (checkSeqRef.current === seq) setChecking(false);
    }
  }

  function onTitleChange(value: string) {
    setTitle(value);
    setLiveSimilar(null); // 書き換え中は古い候補を見せない
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = value.trim();
    if (trimmed.length < 5) return; // タイトルの最小長未満はチェックしない
    debounceRef.current = setTimeout(() => runSimilarCheck(trimmed), 600);
  }

  function onTitleBlur() {
    // 入力を終えて離れた瞬間は待たずに確認する
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
      const trimmed = title.trim();
      if (trimmed.length >= 5) runSimilarCheck(trimmed);
    }
  }
  // 空行を除いた「意見の数」。ラベルに (3/10) のように表示する
  const seedCount = seeds
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean).length;

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
    // 公開は編集・削除できないため、送信前にブラウザの確認ダイアログを挟む
    // (要望テーマの方針)
    <form
      action={formAction}
      onSubmit={(e) => {
        if (
          !window.confirm(
            "公開後のテーマと最初の意見は編集・削除できません。この内容で公開しますか?",
          )
        ) {
          e.preventDefault();
        }
      }}
      className="flex flex-col gap-4"
    >
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
          onChange={(e) => onTitleChange(e.target.value)}
          onBlur={onTitleBlur}
          className="w-full rounded-md border border-stone-500 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900"
        />
        <div aria-live="polite">
          {checking && !liveSimilar?.length && (
            <p className="mt-1 text-xs text-stone-500">似ているテーマがないか確認中...</p>
          )}
          {liveSimilar && liveSimilar.length > 0 && (
            <div className="mt-2 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm">
              <p className="font-medium">似ているテーマが見つかりました。一度のぞいてみませんか?</p>
              <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5">
                {liveSimilar.map((s) => (
                  <li key={s.id}>
                    <a href={`/t/${s.id}`} target="_blank" rel="noreferrer" className="underline">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-stone-600">
                同じ話題なら、そちらで投票や意見投稿をすると議論が集まりやすくなります。
                <br />
                別の論点なら、このまま提案を続けてください。
              </p>
            </div>
          )}
        </div>
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
        <label htmlFor="seeds" className="mb-1 block text-sm font-medium">
          最初の意見(1行に1つ、2〜10個)
          <span
            className={`ml-1.5 font-normal ${
              seedCount > SEED_STATEMENTS_MAX ? "text-red-600" : "text-stone-500"
            }`}
          >
            {seedCount}/{SEED_STATEMENTS_MAX}
          </span>
        </label>
        <AiSeedAssist
          title={title}
          description={description}
          onGenerated={(lines) =>
            setSeeds((prev) => (prev.trim() ? prev.trimEnd() + "\n" : "") + lines.join("\n"))
          }
        />
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
          賛成/反対が分かれそうな意見を並べておくと、参加者が投票しやすくなります。
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
