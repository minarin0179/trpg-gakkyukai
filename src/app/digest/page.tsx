import type { Metadata } from "next";
import Link from "next/link";
import { isDigestBody, listDigestRows, weekStartFromKey, isoWeekKey, formatWeekRange } from "@/lib/digest";

// 週に1回しか増えないため、時間ベースの再生成は1時間で足りる
// (新しい週が入ったときは cron が revalidatePath で即時に反映する)
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "週間ダイジェスト",
  description:
    "TRPG学級会の1週間のまとめ。投票が多かったテーマ、新しく見つかった合意、まだ人が少ないテーマを週ごとに振り返れます。",
};

// 一覧に出す週の数(1年分あれば振り返りには十分)
const LIST_LIMIT = 52;

export default async function DigestIndexPage() {
  const rows = await listDigestRows(LIST_LIMIT);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-bold">週間ダイジェスト</h1>
        <p className="mt-1 text-sm text-stone-600">
          1週間(月曜〜日曜)ごとのまとめです。
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-stone-400 p-6 text-center text-sm text-stone-600">
          まだダイジェストがありません。
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => {
            // 表示に使う期間・週キーは保存済みのbodyから取るが、
            // 壊れた行でも一覧が落ちないよう主キー(週の月曜)から組み直せるようにする
            const weekStart = weekStartFromKey(row.weekStart);
            const body = isDigestBody(row.body) ? row.body : null;
            const weekKey = body?.weekKey ?? isoWeekKey(weekStart);
            const range = body?.range ?? formatWeekRange(weekStart);
            return (
              <li key={row.weekStart} className="rounded-lg border border-stone-400 bg-white p-4">
                <Link prefetch={false} href={`/digest/${weekKey}`} className="font-medium underline">
                  {range} の学級会
                </Link>
                {body && (
                  <p className="mt-1 text-xs text-stone-600">
                    投票{body.totals.votes}件 · 新しいテーマ{body.totals.themes}件 ·
                    投票した人{body.totals.voters}人
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-stone-600">
        <a href="/digest/feed.xml" className="underline">
          RSS
        </a>
        {" で購読できます。"}
      </p>
    </div>
  );
}
