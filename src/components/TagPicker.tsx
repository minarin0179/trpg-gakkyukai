"use client";

import { useRef, useState } from "react";
import { suggestTagsAction } from "@/app/actions";
import { INITIAL_TAGS, TAG_MAX_LENGTH, TAGS_PER_THEME } from "@/lib/config";

// テーマ提案フォームのタグ選択(任意)。候補チップのタップ+自由入力(サジェスト付き)。
// 選択結果は hidden input "tags" にカンマ区切りで載せてServer Actionへ渡す
export function TagPicker() {
  const [selected, setSelected] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const full = selected.length >= TAGS_PER_THEME;

  function toggle(tag: string) {
    setSelected((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : full ? prev : [...prev, tag],
    );
  }

  function addFromInput() {
    const tag = input.normalize("NFKC").trim();
    if (tag.length === 0 || full) return;
    if (!selected.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      setSelected((prev) => [...prev, tag]);
    }
    setInput("");
    setSuggestions([]);
  }

  function onInputChange(v: string) {
    setInput(v);
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

  return (
    <div>
      <label htmlFor="tag-input" className="mb-1 block text-sm font-medium">
        タグ(任意)
        <span className="ml-1.5 font-normal text-stone-500">
          {selected.length}/{TAGS_PER_THEME}
        </span>
      </label>
      <p className="mb-1.5 text-xs text-stone-600 dark:text-stone-500">
        公開後に誰でも追加できるので、無理につけなくて大丈夫です。
      </p>
      <input type="hidden" name="tags" value={selected.join(",")} />
      <div className="flex flex-wrap gap-1.5">
        {[...new Set([...INITIAL_TAGS, ...selected])].map((tag) => {
          const on = selected.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggle(tag)}
              aria-pressed={on}
              className={`rounded-full border px-2.5 py-0.5 text-xs transition ${
                on
                  ? "border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900"
                  : "border-stone-300 bg-white text-stone-600 hover:border-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400"
              }`}
            >
              {tag}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <input
          id="tag-input"
          list="tag-picker-suggestions"
          value={input}
          maxLength={TAG_MAX_LENGTH}
          disabled={full}
          placeholder={full ? `タグは${TAGS_PER_THEME}個までです` : "候補にないタグを入力"}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addFromInput();
            }
          }}
          className="w-48 rounded-md border border-stone-400 bg-white px-2 py-1 text-xs disabled:bg-stone-100 dark:border-stone-700 dark:bg-stone-900"
        />
        <datalist id="tag-picker-suggestions">
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <button
          type="button"
          onClick={addFromInput}
          disabled={full || input.trim().length === 0}
          className="rounded-md border border-stone-400 px-2 py-1 text-xs text-stone-700 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300"
        >
          追加
        </button>
      </div>
    </div>
  );
}
