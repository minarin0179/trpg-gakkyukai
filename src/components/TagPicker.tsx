"use client";

import { useState } from "react";
import { TagSelector } from "@/components/TagSelector";
import { TAGS_PER_THEME } from "@/lib/config";

// テーマ提案フォームのタグ選択(任意)。共通のTagSelectorで
// 使われている既存タグ(DBが唯一の真実、使用数順)の一覧から選ぶ(自由入力も可)。
// 選択結果は hidden input "tags" にカンマ区切りで載せてServer Actionへ渡す
export function TagPicker({ vocabulary }: { vocabulary: string[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const full = selected.length >= TAGS_PER_THEME;

  return (
    <div>
      <p className="mb-1 block text-sm font-medium">
        タグ(任意)
        <span className="ml-1.5 font-normal text-stone-500">
          {selected.length}/{TAGS_PER_THEME}
        </span>
      </p>
      <p className="mb-1.5 text-xs text-stone-600 dark:text-stone-500">
        公開後に誰でも追加できるので、無理につけなくて大丈夫です。
      </p>
      <input type="hidden" name="tags" value={selected.join(",")} />
      <TagSelector
        vocabulary={vocabulary}
        selected={selected}
        onAdd={(tag) => setSelected((prev) => (full ? prev : [...prev, tag]))}
        onRemove={(tag) => setSelected((prev) => prev.filter((t) => t !== tag))}
        full={full}
      />
    </div>
  );
}
