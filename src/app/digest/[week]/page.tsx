import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  agreePercent,
  disagreePercent,
  formatWeekRange,
  getDigestRow,
  isDigestBody,
  legacyTotals,
  parseWeekKey,
  voteTotal,
  weekStartKey,
  type DigestBody,
  type DigestStatement,
  type DigestThemeStatement,
  type DigestTotals,
} from "@/lib/digest";
import { GROUP_COLORS } from "@/lib/group-style";
import { SITE_URL } from "@/lib/site";

// 内容は週が終わった時点で確定し、以後ほとんど変わらない。
// cron・管理画面からの再生成では revalidatePath で即時に更新するため、
// 時間ベースの再生成は1時間で十分
export const revalidate = 3600;

// 動的セグメントをランタイムでISRキャッシュするために必須(テーマページと同じ理由)。
// 空配列=ビルド時は生成せず、アクセスされた週だけをその場でキャッシュする
export function generateStaticParams() {
  return [];
}

// 保存済みの行を読む。body が最新の形式(version 2)でない古い行も、
// ページを404にせず「合計だけの簡易表示」に落とせるよう、判定を分けて返す
type Loaded = { range: string; body: DigestBody | null; legacy: DigestTotals | null };

async function loadDigest(week: string): Promise<Loaded | null> {
  const weekStart = parseWeekKey(week);
  if (!weekStart) return null;
  const row = await getDigestRow(weekStartKey(weekStart));
  if (!row) return null;
  const body = isDigestBody(row.body) ? row.body : null;
  return {
    range: formatWeekRange(weekStart),
    body,
    legacy: body ? null : legacyTotals(row.body),
  };
}

export async function generateMetadata({
  params,
}: PageProps<"/digest/[week]">): Promise<Metadata> {
  const { week } = await params;
  const loaded = await loadDigest(week).catch(() => null);
  if (!loaded) return {};
  const title = `今週の学級会(${loaded.range})`;
  const description = `${loaded.range}のTRPG学級会。今週動いたテーマ、グループを越えて賛成が集まった意見、今週の争点、今週始まったテーマをまとめています。`;
  return {
    title,
    description,
    // フィードの自動検出用。人向けの購読リンクは置かず(生のXMLを見せないため)、
    // リーダーがページから見つけられるようにだけしておく
    alternates: { types: { "application/rss+xml": `${SITE_URL}/digest/feed.xml` } },
    openGraph: { type: "article", siteName: "TRPG学級会", locale: "ja_JP", title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

const CARD = "rounded-lg border border-stone-400 bg-white p-4";

// 意見の本文と割合の1行。合意と争点で見出しだけを変えて使い回す
function StatementRow({
  label,
  statement,
  showDisagree,
}: {
  label: string;
  statement: DigestStatement;
  showDisagree: boolean;
}) {
  return (
    <div className="mt-2 border-t border-stone-200 pt-2">
      <p className="text-xs font-semibold text-stone-700">{label}</p>
      <p className="mt-0.5 text-sm leading-relaxed">「{statement.text}」</p>
      <p className="mt-0.5 text-xs text-stone-600">
        賛成{agreePercent(statement)}%
        {showDisagree && ` · 反対${disagreePercent(statement)}%`}(
        {voteTotal(statement)}票)
      </p>
    </div>
  );
}

// サイト全体のセクション(合意・争点)の1件。どのテーマの意見かを添える
function ThemeStatementCard({
  statement,
  showDisagree,
}: {
  statement: DigestThemeStatement;
  showDisagree: boolean;
}) {
  return (
    <li className={CARD}>
      <p className="text-sm leading-relaxed">「{statement.text}」</p>
      <p className="mt-1 text-xs text-stone-600">
        賛成{agreePercent(statement)}%
        {showDisagree && ` · 反対${disagreePercent(statement)}%`} ·{" "}
        {voteTotal(statement)}票 ·{" "}
        {/* 一覧カードと同じ理由で先読みしない(遷移先はISRキャッシュ済み) */}
        <Link prefetch={false} href={`/t/${statement.themeId}`} className="underline">
          {statement.themeTitle}
        </Link>
      </p>
    </li>
  );
}

function TotalsLine({ totals }: { totals: DigestTotals }) {
  return (
    <p className="text-xs text-stone-600">
      この週の合計: 投票{totals.votes}件 · 新しい意見{totals.statements}件 · 新しいテーマ
      {totals.newThemes}件 · 投票した人{totals.voters}人
    </p>
  );
}

function FooterLinks() {
  return (
    <p className="text-sm">
      <Link prefetch={false} href="/digest" className="underline">
        ほかの週のダイジェスト
      </Link>
      {" · "}
      <Link prefetch={false} href="/themes" className="underline">
        テーマ一覧へ
      </Link>
    </p>
  );
}

export default async function DigestWeekPage({ params }: PageProps<"/digest/[week]">) {
  const { week } = await params;
  const loaded = await loadDigest(week);
  if (!loaded) notFound();
  const { range, body, legacy } = loaded;

  const header = (
    <header>
      <h1 className="text-xl font-bold">今週の学級会</h1>
      <p className="mt-1 text-sm text-stone-600">{range}(週間ダイジェスト)</p>
    </header>
  );

  // 旧形式で保存された週。作り直せば最新の形式になるので、
  // 落とさずに合計だけを見せて、その旨を書いておく
  if (!body) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        {legacy && <TotalsLine totals={legacy} />}
        <p className="rounded-lg border border-dashed border-stone-400 p-6 text-center text-sm text-stone-600">
          この週は旧形式のため詳細がありません。再生成すると最新の形式になります。
        </p>
        <FooterLinks />
      </div>
    );
  }

  const isEmpty =
    body.featured.length === 0 &&
    body.newConsensus.length === 0 &&
    body.contested.length === 0 &&
    body.newThemes.count === 0;

  return (
    <div className="flex flex-col gap-6">
      {header}
      <TotalsLine totals={body.totals} />

      {isEmpty && (
        <p className="rounded-lg border border-dashed border-stone-400 p-6 text-center text-sm text-stone-600">
          この週は目立った動きがありませんでした。
        </p>
      )}

      {body.featured.length > 0 && (
        <section>
          <h2 className="text-base font-bold">今週のテーマ</h2>
          <p className="mt-0.5 text-xs text-stone-600">
            今週いちばん人が集まったテーマです。それぞれの様子をまとめました。
          </p>
          <ul className="mt-2 flex flex-col gap-3">
            {body.featured.map((f) => (
              <li key={f.id} className={CARD}>
                {/* 一覧カードと同じ理由で先読みしない(遷移先はISRキャッシュ済み) */}
                <Link prefetch={false} href={`/t/${f.id}`} className="font-medium underline">
                  {f.title}
                </Link>
                <p className="mt-1 text-xs text-stone-600">
                  今週{f.weekVoters}人が投票 · 意見+{f.weekStatements}件(合計{f.totalVoters}人 ·{" "}
                  {f.totalStatements}件)
                </p>
                {f.groups && f.groups.length > 0 ? (
                  <p className="mt-0.5 text-xs text-stone-600">
                    {f.groups.map((g, i) => (
                      <span key={g.name}>
                        {i > 0 && " / "}
                        {/* 色は意見マップ・結果ページと同じ並び(グループIDの順) */}
                        <span
                          className="mr-1 inline-block h-2 w-2 rounded-full align-baseline"
                          style={{ backgroundColor: GROUP_COLORS[i % GROUP_COLORS.length] }}
                        />
                        グループ{g.name} {g.size}人
                      </span>
                    ))}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-stone-600">意見マップはまだありません</p>
                )}
                {f.consensus && (
                  <StatementRow label="合意" statement={f.consensus} showDisagree={false} />
                )}
                {f.divisive && (
                  <StatementRow label="割れた" statement={f.divisive} showDisagree />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {body.newConsensus.length > 0 && (
        <section>
          <h2 className="text-base font-bold">グループを越えて賛成が集まった意見</h2>
          <p className="mt-0.5 text-xs text-stone-600">
            意見が分かれたテーマでも、多くの人が賛成した意見です。
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {body.newConsensus.map((c) => (
              <ThemeStatementCard
                key={`${c.themeId}-${c.statementId}`}
                statement={c}
                showDisagree={false}
              />
            ))}
          </ul>
        </section>
      )}

      {body.contested.length > 0 && (
        <section>
          <h2 className="text-base font-bold">今週の争点</h2>
          <p className="mt-0.5 text-xs text-stone-600">
            賛成と反対がちょうど半分ずつに割れた意見です。
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {body.contested.map((c) => (
              <ThemeStatementCard
                key={`${c.themeId}-${c.statementId}`}
                statement={c}
                showDisagree
              />
            ))}
          </ul>
        </section>
      )}

      {body.newThemes.count > 0 && (
        <section>
          <h2 className="text-base font-bold">今週始まったテーマ</h2>
          <p className="mt-0.5 text-xs text-stone-600">
            今週は{body.newThemes.count}件のテーマが生まれました。
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {body.newThemes.items.map((t) => (
              <li key={t.id} className={CARD}>
                <Link prefetch={false} href={`/t/${t.id}`} className="font-medium underline">
                  {t.title}
                </Link>
                <p className="mt-1 text-xs text-stone-600">
                  {t.voters}人が投票 · 意見{t.statements}件
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <FooterLinks />
    </div>
  );
}
