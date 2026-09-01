import Link from "next/link";

// タグのチップ表示。タップでそのタグの絞り込み一覧へ。
// max指定時は超過分を「+n」で省略する(一覧カード用)
export function TagChips({ tags, max }: { tags: string[]; max?: number }) {
  if (tags.length === 0) return null;
  const shown = max ? tags.slice(0, max) : tags;
  const rest = tags.length - shown.length;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {shown.map((tag) => (
        <Link
          key={tag}
          prefetch={false}
          href={`/themes?tag=${encodeURIComponent(tag)}`}
          className="rounded-full border border-stone-300 bg-stone-50 px-2 py-0.5 text-xs text-stone-600 hover:border-stone-500 hover:text-stone-800 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
        >
          {tag}
        </Link>
      ))}
      {rest > 0 && <span className="text-xs text-stone-500">+{rest}</span>}
    </span>
  );
}
