"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { addThemeTagAction } from "@/app/actions/themes";
import { TagSelector } from "@/components/TagSelector";
import { TagReportButton } from "@/components/TagReportButton";
import { TAGS_PER_THEME } from "@/lib/config";

// テーマページのタグ行(チップ表示+追加+通報)。
// ページ本体はISRキャッシュのため、追加後の表示はサーバー再取得に頼らず
// クライアント状態を直接更新する(キャッシュはアクション側のrevalidatePathで
// 他の閲覧者向けに追いつく)。削除UIは意図的に無い(削除は通報経由のみ)
export function ThemeTagsRow({
  themeId,
  initialTags,
  vocabulary,
}: {
  themeId: string;
  initialTags: { id: number; tag: string }[];
  vocabulary: string[];
}) {
  const [tags, setTags] = useState(initialTags);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add(tag: string): boolean {
    if (pending) return false;
    // タグの削除はユーザーに開放していない(通報経由のみ)ため、
    // 誤タップで取り消せないタグが付かないよう確認を挟む
    if (
      !window.confirm(`タグ「${tag}」を追加しますか?一度追加すると自分では取り消せません。`)
    ) {
      return false;
    }
    setError(null);
    startTransition(async () => {
      const res = await addThemeTagAction(themeId, tag);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const { id, tag: t } = res.data;
      setTags((prev) =>
        prev.some((x) => x.tag.toLowerCase() === t.toLowerCase())
          ? prev
          : [...prev, { id: id ?? -prev.length - 1, tag: t }],
      );
    });
    return true;
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {tags.map(({ tag }) => (
        <Link
          key={tag}
          prefetch={false}
          href={`/themes?tag=${encodeURIComponent(tag)}`}
          className="rounded-full border border-stone-300 bg-stone-50 px-2 py-0.5 text-xs text-stone-600 hover:border-stone-500 hover:text-stone-800 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
        >
          {tag}
        </Link>
      ))}
      {tags.length < TAGS_PER_THEME && !open && (
        <button
          onClick={() => setOpen(true)}
          className="rounded-full border border-dashed border-stone-400 px-2 py-0.5 text-xs text-stone-500 hover:border-stone-600 hover:text-stone-700 dark:border-stone-600 dark:text-stone-500 dark:hover:text-stone-300"
        >
          タグを追加
        </button>
      )}
      <TagReportButton tags={tags.filter((t) => t.id > 0)} />
      {open && (
        <div className="mt-1 w-full rounded-md border border-stone-300 bg-stone-50 p-3 dark:border-stone-700 dark:bg-stone-800">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs text-stone-600 dark:text-stone-400">
              一覧から選ぶか、新しいタグを入力してください({tags.length}/{TAGS_PER_THEME})
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
            selected={tags.map((t) => t.tag)}
            onAdd={add}
            full={tags.length >= TAGS_PER_THEME}
            pending={pending}
          />
          {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
