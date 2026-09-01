"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addThemeTagAction, suggestTagsAction } from "@/app/actions";
import { TAG_MAX_LENGTH, TAGS_PER_THEME } from "@/lib/config";

// テーマページからのタグ追加。表記揺れ・ニュアンス違いの乱立を防ぐため、
// 入力欄を開いた瞬間から既存タグの候補チップを見せ(使用数順)、入力中は
// 双方向部分一致で絞り込む。候補のクリックが最も楽な操作になるようにして、
// 定着した表記へ収束させる。削除UIは意図的に無い(削除は通報経由のみ)
export function TagEditor({
  themeId,
  existingTags,
}: {
  themeId: string;
  existingTags: string[];
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  // 開いた瞬間に人気タグを取得(空入力=使用数順の候補)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    suggestTagsAction("").then((s) => {
      if (!cancelled) setSuggestions(s);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (existingTags.length >= TAGS_PER_THEME) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full border border-dashed border-stone-400 px-2 py-0.5 text-xs text-stone-500 hover:border-stone-600 hover:text-stone-700 dark:border-stone-600 dark:text-stone-500 dark:hover:text-stone-300"
      >
        タグを追加
      </button>
    );
  }

  const lowerExisting = existingTags.map((t) => t.toLowerCase());
  const candidates = suggestions.filter((s) => !lowerExisting.includes(s.toLowerCase()));

  function onChange(v: string) {
    setValue(v);
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSuggestions(await suggestTagsAction(v.trim()));
    }, 300);
  }

  function add(tag: string) {
    const t = tag.trim();
    if (t.length === 0 || pending) return;
    startTransition(async () => {
      const res = await addThemeTagAction(themeId, t);
      if (res.ok) {
        setValue("");
        setSuggestions([]);
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error ?? "追加できませんでした");
      }
    });
  }

  return (
    <span className="flex w-full flex-col gap-1.5">
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <input
          autoFocus
          value={value}
          maxLength={TAG_MAX_LENGTH}
          placeholder="タグ名を入力"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(value);
            }
            if (e.key === "Escape") setOpen(false);
          }}
          className="w-36 rounded-md border border-stone-400 bg-white px-2 py-0.5 text-xs dark:border-stone-700 dark:bg-stone-900"
        />
        <button
          onClick={() => add(value)}
          disabled={pending || value.trim().length === 0}
          className="rounded-md bg-stone-900 px-2 py-0.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
        >
          {pending ? "追加中..." : "追加"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="text-xs text-stone-500 underline"
        >
          閉じる
        </button>
        {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
      </span>
      {candidates.length > 0 && (
        <span className="inline-flex flex-wrap items-center gap-1">
          <span className="text-xs text-stone-500">候補:</span>
          {candidates.map((s) => (
            <button
              key={s}
              onClick={() => add(s)}
              disabled={pending}
              className="rounded-full border border-stone-300 bg-stone-50 px-2 py-0.5 text-xs text-stone-600 hover:border-stone-500 hover:text-stone-800 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
            >
              {s}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
