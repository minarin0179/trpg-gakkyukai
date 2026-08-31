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
  // 「意見マップあり」はテーマの性質(参加の有無に依存しない)。
  // まだマップが無いテーマでは、参加済みの人にだけ「投票が集まると出ます」と促す。
  const showMap = theme.hasMap === true;
  const showMapPending = isParticipated && theme.hasMap === false;

  return (
    // prefetch無効: 一覧では大量のカードが視界に入るため、先読みが
    // Edgeリクエストの過半を占めていた(読まれない先読みが大半)。
    // 遷移先はISRキャッシュ済みなのでクリック時取得でも十分速い
    <Link
      prefetch={false}
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
        {showMap ? (
          <span className="ml-1 text-emerald-700">· 意見マップあり</span>
        ) : showMapPending ? (
          <span className="ml-1 text-stone-500">· 投票が集まるとマップが出ます</span>
        ) : null}
      </p>
    </Link>
  );
}
