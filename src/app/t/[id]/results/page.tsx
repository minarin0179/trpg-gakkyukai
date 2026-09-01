import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTheme, getThemeCounts, getStatementVoteStats } from "@/lib/queries";

// 各意見の投票内訳(本家Polisのレポート画面に相当する公開集計)。
// 投票・訂正のUIとはページを分離する: 割合を見ながら自分の投票を直す動線を
// 作らないための設計判断(要望テーマ spin_ihvaFbg の議論より)。
// 全員に同じ内容なのでISRでCDN共有し、鮮度は5分で十分とする
export const revalidate = 300;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: PageProps<"/t/[id]/results">): Promise<Metadata> {
  const { id } = await params;
  const theme = await getTheme(id).catch(() => null);
  if (!theme) return {};
  return {
    title: `投票の内訳 — ${theme.title}`,
    robots: { index: false },
  };
}

export default async function ResultsPage({ params }: PageProps<"/t/[id]/results">) {
  const { id } = await params;
  const theme = await getTheme(id);
  if (!theme) notFound();

  const [stats, counts] = await Promise.all([getStatementVoteStats(id), getThemeCounts(id)]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href={`/t/${theme.id}`}
          prefetch={false}
          className="text-xs text-stone-600 underline dark:text-stone-500"
        >
          テーマに戻る
        </Link>
        <h1 className="mt-1 text-xl font-bold">{theme.title}</h1>
        <p className="mt-1 text-xs text-stone-600 dark:text-stone-500">
          投票の内訳 · {counts.voterCount}人が投票 · 集計は約5分ごとに更新
        </p>
      </div>

      <p className="text-xs leading-relaxed text-stone-600 dark:text-stone-400">
        割合は多数決の結果ではなく、意見の分布を見るための参考情報です。
        グループを越えた合意や意見の地形は
        <Link href={`/t/${theme.id}#map`} prefetch={false} className="underline">
          意見マップ
        </Link>
        で確認できます。
      </p>

      <ul className="flex flex-col gap-3">
        {(() => {
          // バーの長さで投票数の多寡も読めるよう、最多得票の意見を100%として相対表示する
          const maxTotal = Math.max(1, ...stats.map((s) => s.agree + s.disagree + s.pass));
          return stats.map((s) => {
            const total = s.agree + s.disagree + s.pass;
            const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
            return (
              <li
                key={s.id}
                className="rounded-md border border-stone-400 bg-white px-3 py-2 text-sm dark:border-stone-800 dark:bg-stone-900"
              >
                <p>{s.text}</p>
                {total > 0 ? (
                  <>
                    <div className="mt-2 h-2 rounded-full bg-stone-100 dark:bg-stone-800">
                      <div
                        className="flex h-2 overflow-hidden rounded-full"
                        role="img"
                        aria-label={`賛成${pct(s.agree)}パーセント、反対${pct(s.disagree)}パーセント、パス${pct(s.pass)}パーセント、計${total}票`}
                        style={{ width: `${(total / maxTotal) * 100}%` }}
                      >
                        <div className="bg-emerald-600" style={{ width: `${(s.agree / total) * 100}%` }} />
                        <div className="bg-rose-600" style={{ width: `${(s.disagree / total) * 100}%` }} />
                        <div className="bg-stone-400" style={{ width: `${(s.pass / total) * 100}%` }} />
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-stone-600 dark:text-stone-500">
                      <span className="font-medium text-emerald-700 dark:text-emerald-500">
                        賛成 {pct(s.agree)}%
                      </span>
                      {" · "}
                      <span className="font-medium text-rose-700 dark:text-rose-500">
                        反対 {pct(s.disagree)}%
                      </span>
                      {" · "}
                      <span>パス {pct(s.pass)}%</span>(計{total}票)
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-xs text-stone-500">まだ投票がありません</p>
                )}
              </li>
            );
          });
        })()}
      </ul>
    </div>
  );
}
