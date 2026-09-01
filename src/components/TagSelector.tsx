"use client";

import { useState } from "react";
import { TAG_MAX_LENGTH } from "@/lib/config";

// タグ選択の共通UI(テーマ提案フォームと、既存テーマへのタグ追加で共用)。
// 方針: サジェスト(検索型)ではなく語彙の一覧を最初から見せる。
// 既存タグを見逃して似た表記を新設してしまう事故を構造的に防ぐ。
// 入力欄は一覧の絞り込みフィルタを兼ね、候補に無いタグはそのまま追加できる
export function TagSelector({
  vocabulary,
  selected,
  onAdd,
  onRemove,
  full,
  pending,
}: {
  vocabulary: string[]; // 候補一覧(初期タグ+使われている既存タグ)
  selected: string[]; // 選択済み/付与済み。onRemove未指定なら解除不可(押された表示のみ)
  onAdd: (tag: string) => void;
  onRemove?: (tag: string) => void;
  full: boolean;
  pending?: boolean;
}) {
  const [filter, setFilter] = useState("");

  const lowerSelected = selected.map((t) => t.toLowerCase());
  // 語彙+選択済みをまとめ、大文字小文字違いの重複を除いて一覧にする
  const chips: string[] = [];
  for (const t of [...vocabulary, ...selected]) {
    if (!chips.some((c) => c.toLowerCase() === t.toLowerCase())) chips.push(t);
  }
  const q = filter.normalize("NFKC").trim().toLowerCase();
  const visible = q
    ? chips.filter(
        (t) => t.toLowerCase().includes(q) || lowerSelected.includes(t.toLowerCase()),
      )
    : chips;
  const exactExists = chips.some((t) => t.toLowerCase() === q);

  function addFromInput() {
    const tag = filter.normalize("NFKC").trim();
    if (tag.length === 0 || full || pending) return;
    // 一覧に同名(大文字小文字違い含む)があればその表記に寄せる
    const canonical = chips.find((t) => t.toLowerCase() === tag.toLowerCase()) ?? tag;
    if (!lowerSelected.includes(canonical.toLowerCase())) onAdd(canonical);
    setFilter("");
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((tag) => {
          const on = lowerSelected.includes(tag.toLowerCase());
          const clickable = on ? !!onRemove : !full;
          return (
            <button
              key={tag}
              type="button"
              disabled={pending || !clickable}
              onClick={() => (on ? onRemove?.(tag) : onAdd(tag))}
              aria-pressed={on}
              className={`rounded-full border px-2.5 py-0.5 text-xs transition disabled:opacity-60 ${
                on
                  ? "border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900"
                  : "border-stone-300 bg-white text-stone-600 hover:border-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400"
              }`}
            >
              {tag}
            </button>
          );
        })}
        {visible.length === 0 && (
          <span className="text-xs text-stone-500">一致する候補はありません</span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <input
          value={filter}
          maxLength={TAG_MAX_LENGTH}
          disabled={full}
          placeholder={full ? "タグは上限に達しています" : "タグを絞り込み・新しく入力"}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addFromInput();
            }
          }}
          className="w-52 rounded-md border border-stone-400 bg-white px-2 py-1 text-xs disabled:bg-stone-100 dark:border-stone-700 dark:bg-stone-900"
        />
        {q.length > 0 && !exactExists && !full && (
          <button
            type="button"
            disabled={pending}
            onClick={addFromInput}
            className="rounded-md border border-stone-400 px-2 py-1 text-xs text-stone-700 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300"
          >
            「{filter.normalize("NFKC").trim()}」を追加
          </button>
        )}
      </div>
    </div>
  );
}
