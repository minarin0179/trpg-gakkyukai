"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addThemeTagAction } from "@/app/actions";
import { TagSelector } from "@/components/TagSelector";
import { TAGS_PER_THEME } from "@/lib/config";

// 既存テーマへのタグ追加。提案フォームと同じTagSelector(語彙一覧+自由入力)を
// 開閉式で出す。付与済みタグは押された表示になり解除は不可
// (削除は通報経由のみ、要望テーマの方針)
export function TagEditor({
  themeId,
  existingTags,
  vocabulary,
}: {
  themeId: string;
  existingTags: string[];
  vocabulary: string[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

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

  function add(tag: string) {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const res = await addThemeTagAction(themeId, tag);
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error ?? "追加できませんでした");
      }
    });
  }

  return (
    <div className="mt-1 w-full rounded-md border border-stone-300 bg-stone-50 p-3 dark:border-stone-700 dark:bg-stone-800">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-stone-600 dark:text-stone-400">
          一覧から選ぶか、新しいタグを入力してください({existingTags.length}/{TAGS_PER_THEME})
        </p>
        <button
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="text-xs text-stone-500 underline"
        >
          閉じる
        </button>
      </div>
      <TagSelector
        vocabulary={vocabulary}
        selected={existingTags}
        onAdd={add}
        full={existingTags.length >= TAGS_PER_THEME}
        pending={pending}
      />
      {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
