import Link from "next/link";
import { listThemes, type ThemeWithCounts } from "@/lib/queries";
import { PROMOTION_MIN_PARTICIPANTS } from "@/lib/config";

export const dynamic = "force-dynamic";

function ThemeCard({ theme }: { theme: ThemeWithCounts }) {
  return (
    <Link
      href={`/t/${theme.id}`}
      className="block rounded-lg border border-stone-200 bg-white p-4 transition hover:border-stone-400 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-stone-600"
    >
      <h3 className="font-semibold">{theme.title}</h3>
      {theme.description && (
        <p className="mt-1 line-clamp-2 text-sm text-stone-600 dark:text-stone-400">{theme.description}</p>
      )}
      <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
        {theme.voterCount}人が投票 · 意見{theme.statementCount}件
      </p>
    </Link>
  );
}

export default async function HomePage({
  searchParams,
}: PageProps<"/">) {
  const { tab } = await searchParams;
  const showFresh = tab === "new";
  const { main, fresh } = await listThemes();
  const list = showFresh ? fresh : main;

  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-stone-200 dark:border-stone-800">
        <Link
          href="/"
          className={`px-4 py-2 text-sm font-medium ${!showFresh ? "border-b-2 border-stone-900 dark:border-stone-100" : "text-stone-500 dark:text-stone-400"}`}
        >
          議論中
        </Link>
        <Link
          href="/?tab=new"
          className={`px-4 py-2 text-sm font-medium ${showFresh ? "border-b-2 border-stone-900 dark:border-stone-100" : "text-stone-500 dark:text-stone-400"}`}
        >
          新着
        </Link>
      </div>

      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">
          {showFresh ? (
            <>
              まだ新着テーマがありません。
              <Link href="/new" className="ml-1 underline">
                最初のテーマを提案してみませんか?
              </Link>
            </>
          ) : (
            <>
              {PROMOTION_MIN_PARTICIPANTS}人以上が投票したテーマがここに並びます。
              <Link href="/?tab=new" className="ml-1 underline">
                新着タブ
              </Link>
              から投票に参加してください。
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((t) => (
            <ThemeCard key={t.id} theme={t} />
          ))}
        </div>
      )}
    </div>
  );
}
