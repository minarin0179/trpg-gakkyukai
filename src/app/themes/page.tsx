import type { Metadata } from "next";
import Link from "next/link";
import { listThemes } from "@/lib/queries";
import { PROMOTION_MIN_PARTICIPANTS } from "@/lib/config";
import { ThemeCard } from "@/components/ThemeCard";

export const metadata: Metadata = { title: "テーマ一覧" };
export const dynamic = "force-dynamic";

export default async function ThemesPage({ searchParams }: PageProps<"/themes">) {
  const { tab } = await searchParams;
  const showFresh = tab === "new";
  const { main, fresh } = await listThemes();
  const list = showFresh ? fresh : main;

  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-stone-200 dark:border-stone-800">
        <Link
          href="/themes"
          className={`px-4 py-2 text-sm font-medium ${!showFresh ? "border-b-2 border-stone-900 dark:border-stone-100" : "text-stone-600 dark:text-stone-500"}`}
        >
          議論中
        </Link>
        <Link
          href="/themes?tab=new"
          className={`px-4 py-2 text-sm font-medium ${showFresh ? "border-b-2 border-stone-900 dark:border-stone-100" : "text-stone-600 dark:text-stone-500"}`}
        >
          新着
        </Link>
      </div>

      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 p-8 text-center text-sm text-stone-600 dark:border-stone-700 dark:text-stone-500">
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
              <Link href="/themes?tab=new" className="ml-1 underline">
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
