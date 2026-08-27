import Link from "next/link";
import type { ThemeWithCounts } from "@/lib/queries";
import { formatRelativeDate } from "@/lib/format";

export function ThemeCard({ theme }: { theme: ThemeWithCounts }) {
  // 参加済みで未回答が残っている場合のバッジ(要望#4)。
  // 未参加のテーマ(未読)では全件が未回答なので出さない。
  const showUnanswered =
    theme.participated && theme.unansweredCount != null && theme.unansweredCount > 0;
  // 参加済みテーマでマップが生成済みかを示す(要望#5)。
  const showMapStatus = theme.participated;

  return (
    <Link
      href={`/t/${theme.id}`}
      className="block rounded-lg border border-stone-400 bg-white p-4 transition hover:border-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-stone-600"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">{theme.title}</h3>
        {showUnanswered && (
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            未回答 {theme.unansweredCount}件
          </span>
        )}
      </div>
      {theme.description && (
        <p className="mt-1 line-clamp-2 text-sm text-stone-700 dark:text-stone-500">
          {theme.description}
        </p>
      )}
      <p className="mt-2 text-xs text-stone-600 dark:text-stone-500">
        {theme.voterCount}人が投票 · 意見{theme.statementCount}件 · {formatRelativeDate(theme.createdAt)}
        {showMapStatus &&
          (theme.hasMap ? (
            <span className="ml-1 text-emerald-700">· 意見マップあり</span>
          ) : (
            <span className="ml-1 text-stone-500">· 投票が集まるとマップが出ます</span>
          ))}
      </p>
    </Link>
  );
}
