import Link from "next/link";
import type { ThemeWithCounts } from "@/lib/queries";

export function ThemeCard({ theme }: { theme: ThemeWithCounts }) {
  return (
    <Link
      href={`/t/${theme.id}`}
      className="block rounded-lg border border-stone-200 bg-white p-4 transition hover:border-stone-400 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-stone-600"
    >
      <h3 className="font-semibold">{theme.title}</h3>
      {theme.description && (
        <p className="mt-1 line-clamp-2 text-sm text-stone-700 dark:text-stone-500">
          {theme.description}
        </p>
      )}
      <p className="mt-2 text-xs text-stone-600 dark:text-stone-500">
        {theme.voterCount}人が投票 · 意見{theme.statementCount}件
      </p>
    </Link>
  );
}
