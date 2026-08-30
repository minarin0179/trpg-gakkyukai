import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTheme, getThemeCounts, getVisibleStatements, getMathResult } from "@/lib/queries";
import type { MathResultJson } from "@/lib/recompute";
import { VoteDeck } from "@/components/VoteDeck";
import { StatementForm } from "@/components/StatementForm";
import { OpinionMap, type PublicMathResult } from "@/components/OpinionMap";
import { StatementList } from "@/components/StatementList";
import { ReportButton } from "@/components/ReportButton";
import { ShareTheme } from "@/components/ShareTheme";
import { StatementGuidelines } from "@/components/StatementGuidelines";
import { StatementComposer } from "@/components/StatementComposer";
import { ThemePersonalization } from "@/components/ThemePersonalization";
import { formatRelativeDate } from "@/lib/format";

// テーマページはエッジキャッシュ可能にして Origin Transfer を大幅削減する。
// 共有部分(タイトル・意見・マップ・合意)だけをここで描画し、cookie依存の個人化
// (自分の投票・マップ上の自分の位置)はクライアントから /api/t/[id]/me で取得する。
// 新規意見の投稿時は createStatementAction が revalidatePath でこのページを更新する。
export const revalidate = 30;

// 動的セグメント([id])をランタイムでISRキャッシュするには generateStaticParams が必須。
// 空配列=ビルド時は生成せず、アクセスされたテーマだけをその場でISRキャッシュする
// (これが無いと revalidate は無視され毎回オリジン描画=Fast Origin Transferを浪費する)。
export function generateStaticParams() {
  return [];
}

// 共有時のカードのタイトル・説明をテーマ固有にする(OG画像は opengraph-image.tsx)
export async function generateMetadata({ params }: PageProps<"/t/[id]">): Promise<Metadata> {
  const { id } = await params;
  const theme = await getTheme(id).catch(() => null);
  if (!theme) return {};
  const description =
    theme.description?.trim().slice(0, 120) ||
    "賛成・反対・パスで投票して、グループを越えた合意点を見つけよう。";
  // Next.jsは openGraph / twitter を丸ごと置換するため、レイアウトの
  // siteName や card(summary_large_image)をここでも明示しないと失われる。
  return {
    title: theme.title,
    description,
    openGraph: {
      type: "article",
      siteName: "TRPG学級会",
      locale: "ja_JP",
      title: theme.title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title: theme.title,
      description,
    },
  };
}

export default async function ThemePage({ params }: PageProps<"/t/[id]">) {
  const { id } = await params;
  const theme = await getTheme(id);
  if (!theme) notFound();

  const [counts, allStatements, mathRow] = await Promise.all([
    getThemeCounts(id),
    getVisibleStatements(id),
    getMathResult(id),
  ]);

  // pidMap(参加者UUID→行列index)はサーバー内でのみ使い、クライアントには渡さない。
  // 自分の点の位置(myIndex)は /api/t/[id]/me 側で pidMap を使って解決する。
  const raw = (mathRow?.result ?? null) as MathResultJson | null;
  let publicResult: PublicMathResult | null = null;
  if (raw) {
    const { pidMap: _pidMap, ...rest } = raw;
    publicResult = rest as PublicMathResult;
  }

  const items = allStatements.map((s) => ({ id: s.id, text: s.text }));
  const statementTexts: Record<number, string> = {};
  for (const s of allStatements) statementTexts[s.id] = s.text;

  return (
    <ThemePersonalization themeId={theme.id}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-bold">{theme.title}</h1>
          {theme.description && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700 dark:text-stone-300">
              {theme.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-stone-600 dark:text-stone-500">
            <span>
              {counts.voterCount}人が投票 · 意見{allStatements.length}件 ·{" "}
              {formatRelativeDate(theme.createdAt)}
            </span>
            <ShareTheme themeId={theme.id} title={theme.title} />
            <ReportButton targetType="theme" targetId={theme.id} />
          </div>
        </div>

        <section id="vote" className="scroll-mt-20">
          <h2 className="mb-1 text-sm font-semibold text-stone-700 dark:text-stone-300">
            まずは投票してみましょう
          </h2>
          <p className="mb-3 text-xs leading-relaxed text-stone-600 dark:text-stone-400">
            投票を重ねると、あなたと考えの近い人がわかり、下の意見マップにあなたの立場が現れます。
          </p>
          <VoteDeck themeId={theme.id} statements={items} />
        </section>

        <section id="post" className="scroll-mt-20">
          <h2 className="mb-2 text-sm font-semibold text-stone-700 dark:text-stone-300">
            まだ出ていない視点が思い浮かんだら、あなたの意見を投稿してみましょう
          </h2>
          <StatementComposer statementCount={items.length}>
            <StatementGuidelines />
            <StatementForm themeId={theme.id} />
          </StatementComposer>
        </section>

        <div className="mt-6 border-t border-stone-400 pt-16 dark:border-stone-700">
          <h2 className="text-lg font-bold">みんなの考えを見てみましょう</h2>
        </div>

        <section id="map" className="scroll-mt-20">
          <h3 className="mb-2 text-sm font-semibold text-stone-700 dark:text-stone-300">意見マップ</h3>
          <OpinionMap result={publicResult} statementTexts={statementTexts} />
        </section>

        <section>
          <h3 className="mb-1 text-sm font-semibold text-stone-700 dark:text-stone-300">
            すべての意見({allStatements.length})
          </h3>
          <p className="mb-3 text-xs text-stone-600 dark:text-stone-400">
            自分の投票がハイライトされます。押し直せば訂正できます。
          </p>
          <StatementList themeId={theme.id} statements={items} />
        </section>
      </div>
    </ThemePersonalization>
  );
}
