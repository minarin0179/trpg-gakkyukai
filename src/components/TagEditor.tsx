"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addThemeTagAction, suggestTagsAction } from "@/app/actions";
import { TAG_MAX_LENGTH, TAGS_PER_THEME } from "@/lib/config";

// テーマページからのタグ追加。既存タグへのサジェスト(datalist)で表記揺れを抑える。
// 削除UIは意図的に無い(削除は通報経由のみ、要望テーマの方針)
export function TagEditor({ themeId, tagCount }: { themeId: string; tagCount: number }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  if (tagCount >= TAGS_PER_THEME) return null;

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

  function onChange(v: string) {
    setValue(v);
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = v.trim();
    if (trimmed.length === 0) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSuggestions(await suggestTagsAction(trimmed));
    }, 300);
  }

  function submit() {
    const tag = value.trim();
    if (tag.length === 0 || pending) return;
    startTransition(async () => {
      const res = await addThemeTagAction(themeId, tag);
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
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <input
        autoFocus
        list="tag-suggestions"
        value={value}
        maxLength={TAG_MAX_LENGTH}
        placeholder="タグ名を入力"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") setOpen(false);
        }}
        className="w-36 rounded-md border border-stone-400 bg-white px-2 py-0.5 text-xs dark:border-stone-700 dark:bg-stone-900"
      />
      <datalist id="tag-suggestions">
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <button
        onClick={submit}
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
  );
}
