import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getDigestRow,
  isDigestBody,
  parseWeekKey,
  weekStartKey,
  type DigestBody,
} from "@/lib/digest";

// 内容は週が終わった時点で確定し、以後ほとんど変わらない。
// cron・管理画面からの再生成では revalidatePath で即時に更新するため、
// 時間ベースの再生成は1時間で十分
export const revalidate = 3600;

// 動的セグメントをランタイムでISRキャッシュするために必須(テーマページと同じ理由)。
// 空配列=ビルド時は生成せず、アクセスされた週だけをその場でキャッシュする
export function generateStaticParams() {
  return [];
}

async function loadDigest(week: string): Promise<DigestBody | null> {
  const weekStart = parseWeekKey(week);
  if (!weekStart) return null;
  const row = await getDigestRow(weekStartKey(weekStart));
  if (!row || !isDigestBody(row.body)) return null;
  return row.body;
}

export async function generateMetadata({
  params,
}: PageProps<"/digest/[week]">): Promise<Metadata> {
  const { week } = await params;
  const body = await loadDigest(week).catch(() => null);
  if (!body) return {};
  const title = `今週の学級会(${body.range})`;
  const description = `${body.range}のTRPG学級会。投票が多かったテーマ、新しく見つかった合意、まだ人が少ないテーマをまとめています。`;
  return {
    title,
    description,
    openGraph: { type: "article", siteName: "TRPG学級会", locale: "ja_JP", title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function DigestWeekPage({ params }: PageProps<"/digest/[week]">) {
  const { week } = await params;
  const body = await loadDigest(week);
  if (!body) notFound();

  const isEmpty =
    body.mostVoted.length === 0 &&
    body.newConsensus.length === 0 &&
    body.quietNew.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-bold">今週の学級会</h1>
        <p className="mt-1 text-sm text-stone-600">{body.range}(週間ダイジェスト)</p>
      </header>

      {isEmpty && (
        <p className="rounded-lg border border-dashed border-stone-400 p-6 text-center text-sm text-stone-600">
          この週は目立った動きがありませんでした。
        </p>
      )}

      {body.mostVoted.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold">投票が多かったテーマ</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {body.mostVoted.map((t) => (
              <li key={t.id} className="rounded-lg border border-stone-400 bg-white p-3">
                {/* 一覧カードと同じ理由で先読みしない(遷移先はISRキャッシュ済み) */}
                <Link prefetch={false} href={`/t/${t.id}`} className="font-medium underline">
                  {t.title}
                </Link>
                <p className="mt-1 text-xs text-stone-600">
                  {t.voterCount}人が投票 · 意見{t.statementCount}件
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {body.newConsensus.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold">新しく見つかった合意</h2>
          <p className="mt-1 text-xs text-stone-600">
            意見が分かれたテーマでも、グループを越えて賛成が集まった意見です。
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {body.newConsensus.map((c) => (
              <li
                key={`${c.themeId}-${c.statementId}`}
                className="rounded-lg border border-stone-400 bg-white p-3"
              >
                <p className="text-sm">「{c.text}」</p>
                <p className="mt-1 text-xs text-stone-600">
                  賛成{Math.round(c.agreeRatio * 100)}% ·{" "}
                  <Link prefetch={false} href={`/t/${c.themeId}`} className="underline">
                    {c.themeTitle}
                  </Link>
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {body.quietNew.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold">まだ人が少ないテーマ</h2>
          <p className="mt-1 text-xs text-stone-600">
            この週に生まれたテーマです。数票入るだけで意見の地図が動きます。
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {body.quietNew.map((t) => (
              <li key={t.id} className="rounded-lg border border-stone-400 bg-white p-3">
                <Link prefetch={false} href={`/t/${t.id}`} className="font-medium underline">
                  {t.title}
                </Link>
                <p className="mt-1 text-xs text-stone-600">
                  {t.voterCount}人が投票 · 意見{t.statementCount}件
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-stone-600">
        この週の合計: 投票{body.totals.votes}件 · 新しい意見{body.totals.statements}件 ·
        新しいテーマ{body.totals.themes}件 · 投票した人{body.totals.voters}人
      </p>

      <p className="text-sm">
        <Link prefetch={false} href="/digest" className="underline">
          ほかの週のダイジェスト
        </Link>
        {" · "}
        <Link prefetch={false} href="/themes" className="underline">
          テーマ一覧へ
        </Link>
      </p>
    </div>
  );
}
