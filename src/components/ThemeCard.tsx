import Link from "next/link";
import type { ThemeWithCounts } from "@/lib/queries";
import { formatRelativeDate } from "@/lib/format";

export function ThemeCard({ theme }: { theme: ThemeWithCounts }) {
  // participated が boolean のときだけ状態が判定できる(cookie未発行の匿名は undefined)。
  const isParticipated = theme.participated === true;
  const isNotParticipated = theme.participated === false;
  const unanswered = theme.unansweredCount ?? 0;
  // 参加済みで、まだ投票していない意見がある(要望#4)
  const showNew = isParticipated && unanswered > 0;
  // 参加済みで全部回答済み
  const showParticipatedDone = isParticipated && unanswered === 0;
  // 未参加(どのタブでも一貫して表示する)
  const showNotParticipated = isNotParticipated;
  // 参加済みテーマは意見マップの生成状況を出す(要望#5)
  const showMapStatus = isParticipated;

  return (
    <Link
      href={`/t/${theme.id}`}
      className="block rounded-lg border border-stone-400 bg-white p-4 transition hover:border-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-stone-600"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">{theme.title}</h3>
        {showNew ? (
          <span className="shrink-0 rounded-full border border-rose-400 bg-white px-2 py-0.5 text-xs font-medium text-rose-600 dark:bg-stone-900">
            新着 {theme.unansweredCount}件
          </span>
        ) : showParticipatedDone ? (
          <span className="shrink-0 rounded-full border border-emerald-400 bg-white px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-stone-900">
            参加済み
          </span>
        ) : showNotParticipated ? (
          <span className="shrink-0 rounded-full border border-stone-300 bg-white px-2 py-0.5 text-xs font-medium text-stone-500 dark:border-stone-700 dark:bg-stone-900">
            未参加
          </span>
        ) : null}
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
