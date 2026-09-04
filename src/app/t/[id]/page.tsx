import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTheme, getThemeCounts, getVisibleStatements, getMathResult, getGroupVoteBreakdown, getThemeTags, getTagVocabulary, getRelatedThemes } from "@/lib/queries";
import { StatementMap } from "@/components/StatementMap";
import { VoteDeck } from "@/components/VoteDeck";
import { StatementForm } from "@/components/StatementForm";
import { OpinionMap } from "@/components/OpinionMap";
import { toMapPayload, toPublicMathResult } from "@/lib/math-result";
import { MAP_MIN_VOTES, CHART_MIN_ITEMS, RELATED_THEMES_COUNT } from "@/lib/config";
import { StatementList } from "@/components/StatementList";
import { ReportButton } from "@/components/ReportButton";
import { ShareTheme } from "@/components/ShareTheme";
import { StatementGuidelines } from "@/components/StatementGuidelines";
import { StatementComposer } from "@/components/StatementComposer";
import { ThemePersonalization } from "@/components/ThemePersonalization";
import { LiveVoterCount } from "@/components/LiveVoterCount";
import { ThemeTagsRow } from "@/components/ThemeTagsRow";
import { formatRelativeDate } from "@/lib/format";
import { GROUP_COLORS, GROUP_NAMES } from "@/lib/group-style";
import { groupsLackingAgreeRepness } from "@/lib/repness";

// テーマページはエッジキャッシュ可能にして Origin Transfer を大幅削減する。
// 共有部分(タイトル・意見・マップ・合意)だけをここで描画し、cookie依存の個人化
// (自分の投票・マップ上の自分の位置)はクライアントから /api/t/[id]/me で取得する。
// 時間ベースの再生成は30分と長めだが、内容が変わるイベントは全て即時無効化される:
// - 意見の投稿: createStatementAction が revalidatePath
// - マップの更新: recomputeTheme 成功時に revalidatePath
// - 削除対応: admin の removeContentAction が revalidatePath
// 唯一遅れるのは投票数・参加人数で、これはクライアントが /api/t/[id]/stats
// (CDN 60秒キャッシュ)から取得して補う。
export const revalidate = 1800;

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

  const [counts, allStatements, mathRow, tags, tagVocabulary, relatedThemes] = await Promise.all([
    getThemeCounts(id),
    getVisibleStatements(id),
    getMathResult(id),
    getThemeTags(id),
    getTagVocabulary(),
    // 「ほかのテーマ」欄(全員共通)。個人の投票状況では絞らない(ISRのため cookie は読めない)
    getRelatedThemes(id, null, RELATED_THEMES_COUNT),
  ]);

  // pidMap(参加者UUID→行列index)はサーバー内でのみ使い、クライアントには渡さない。
  // 自分の点の位置(myIndex)は /api/t/[id]/me 側で pidMap を使って解決する。
  const publicResult = toPublicMathResult(mathRow?.result ?? null);
  // クライアントへは意見マップが実際に読む項目だけを渡す。参加者の点は
  // タプル化してキー名の反復を落とす(参加者1000人規模ではここが転送量の最大要因)
  const mapPayload = publicResult ? toMapPayload(publicResult) : null;

  const items = allStatements.map((s) => ({ id: s.id, text: s.text }));
  const statementTexts: Record<number, string> = {};
  for (const s of allStatements) statementTexts[s.id] = s.text;

  // 意見コンパス用のデータ。位置と向きは保存済み計算結果から、
  // 票数フィルタ(7票未満のノイズ除去)はグループ別集計の合計で行う。
  // カードに割合は出さない(withBreakdown=false)ため、統計値は0のダミーでよい
  const compassBreakdown = publicResult
    ? await getGroupVoteBreakdown(theme.id, mathRow ?? undefined).catch(() => null)
    : null;
  const compassItems = compassBreakdown
    ? allStatements.flatMap((s) => {
        const xy = compassBreakdown.statementXY[s.id];
        const rows = compassBreakdown.byStatement[s.id];
        if (!xy || !rows) return [];
        const t = rows.reduce((sum, c) => sum + c.agree + c.disagree + c.pass, 0);
        if (t < MAP_MIN_VOTES) return [];
        return [
          { id: s.id, text: s.text, agree: 0, disagree: 0, pass: 0, x: xy[0], y: xy[1], byGroup: null },
        ];
      })
    : [];

  // 「特に賛成する意見」が相対的に少ないグループ。投稿欄の上で代弁を呼びかける
  const lackingAgreeGroups =
    mapPayload?.repness && mapPayload.groupCount >= 2
      ? groupsLackingAgreeRepness(
          mapPayload.repness,
          mapPayload.groupCount,
          (sid) => sid in statementTexts,
        )
      : [];

  return (
    <ThemePersonalization themeId={theme.id}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-bold">{theme.title}</h1>
          {theme.description && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">
              {theme.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-stone-600">
            <span>
              <LiveVoterCount themeId={theme.id} initial={counts.voterCount} />
              人が投票 · 意見{allStatements.length}件 · {formatRelativeDate(theme.createdAt)}
            </span>
            <ShareTheme themeId={theme.id} title={theme.title} appearance="button" />
            <ReportButton targetType="theme" targetId={theme.id} />
          </div>
          {/* タグ: 誰でも追加可(削除は通報経由のみ)。追加時の表示は
              クライアント側で即時更新される(ページ本体はISRキャッシュのため) */}
          <ThemeTagsRow themeId={theme.id} initialTags={tags} vocabulary={tagVocabulary} />
        </div>

        <section id="vote" className="scroll-mt-20">
          <h2 className="mb-1 text-sm font-semibold text-stone-700">
            まずは投票してみましょう
          </h2>
          <p className="mb-3 text-xs leading-relaxed text-stone-600">
            投票を重ねると、あなたと考えの近い人がわかり、下の意見マップにあなたの立場が現れます。
          </p>
          <VoteDeck
            themeId={theme.id}
            statements={items}
            priorities={mapPayload?.statementPriorities ?? null}
          />
        </section>

        <section id="post" className="scroll-mt-20">
          <h2 className="mb-2 text-sm font-semibold text-stone-700">
            まだ出ていない視点が思い浮かんだら、あなたの意見を投稿してみましょう
          </h2>
          {lackingAgreeGroups.length > 0 && (
            <p className="mb-2 rounded-md border border-dashed border-stone-400 bg-stone-50 px-3 py-2 text-xs leading-relaxed text-stone-700">
              {lackingAgreeGroups.map((g, i) => (
                <span key={g}>
                  {i > 0 && "・"}
                  <span
                    className="mr-1 inline-block h-2 w-2 rounded-full align-baseline"
                    style={{ backgroundColor: GROUP_COLORS[g % GROUP_COLORS.length] }}
                  />
                  グループ{GROUP_NAMES[g] ?? g}
                </span>
              ))}
              が特に賛成する意見は、他のグループに比べてまだ少ないようです。
              そうした立場の気持ちを代弁する意見は、まだ出ていない視点かもしれません。
            </p>
          )}
          <StatementComposer statementCount={items.length}>
            <StatementGuidelines />
            <StatementForm themeId={theme.id} />
          </StatementComposer>
        </section>

        <div className="mt-6 border-t border-stone-400 pt-16">
          <h2 className="text-lg font-bold">みんなの考えを見てみましょう</h2>
        </div>

        <section id="map" className="scroll-mt-20">
          <h3 className="mb-2 text-sm font-semibold text-stone-700">意見マップ</h3>
          <OpinionMap
            result={mapPayload}
            statementTexts={statementTexts}
            afterMap={
              compassItems.length >= CHART_MIN_ITEMS && compassBreakdown ? (
                <div id="compass" className="scroll-mt-20">
                  <h3 className="mb-2 text-sm font-semibold text-stone-700">
                    意見コンパス
                  </h3>
                  <StatementMap
                    items={compassItems}
                    groupDirections={compassBreakdown.groupDirections}
                    withBreakdown={false}
                  />
                </div>
              ) : null
            }
          />
        </section>

        {/* 詳細な集計への導線。小さな文中リンクだと気づかれないため、独立したカードにする */}
        <Link
          href={`/t/${theme.id}/report`}
          prefetch={false}
          className="block rounded-lg border border-stone-400 bg-white px-4 py-3 transition hover:border-stone-600"
        >
          <p className="text-sm font-semibold">より詳しい結果はレポートページで →</p>
          <p className="mt-0.5 text-xs text-stone-600">
            意見ごとの賛成・反対・パスの割合を、全体とグループ別に見られます
          </p>
        </Link>

        {/* ページ全体が長く見えないよう、既定では折りたたむ(訂正したい人だけ開く)。
            開閉はブロック全体をクリック領域にする */}
        <section>
          <details className="group">
            <summary className="block cursor-pointer list-none rounded-lg border border-stone-400 bg-white px-4 py-3 transition marker:content-none group-open:rounded-b-none hover:border-stone-600 [&::-webkit-details-marker]:hidden">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                  className="h-3 w-3 shrink-0 fill-none stroke-stone-500 stroke-2 transition-transform group-open:rotate-90"
                >
                  <path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                すべての意見({allStatements.length})
              </p>
              <p className="mt-0.5 pl-5 text-xs text-stone-600">
                自分の投票を確認・修正できます
              </p>
            </summary>
            <div className="rounded-b-lg border border-t-0 border-stone-400 bg-white px-4 py-3">
              <StatementList themeId={theme.id} statements={items} />
            </div>
          </details>
        </section>

        {/* 投票せずに回遊したい人のための行き先。ページを開いた時点で常に出す
            (投票を終えた人向けの「次のテーマ」は VoteDeck 側で個人に合わせて出す) */}
        <section aria-labelledby="related-heading">
          <h2 id="related-heading" className="text-base font-bold">
            ほかのテーマ
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-stone-600">
            このテーマとタグの近いものや、いま意見が動いているテーマです。
          </p>
          {relatedThemes.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {relatedThemes.map((r) => (
                <li key={r.id} className="rounded-lg border border-stone-400 bg-white px-4 py-3">
                  <Link
                    href={`/t/${r.id}`}
                    prefetch={false}
                    className="text-sm font-semibold underline decoration-stone-400 underline-offset-2 hover:decoration-stone-800"
                  >
                    {r.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-stone-600">
                    {r.voterCount}人が投票 · 意見{r.statementCount}件
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-sm">
            <Link href="/themes" prefetch={false} className="text-stone-600 underline hover:text-stone-800">
              テーマ一覧へ
            </Link>
          </p>
        </section>
      </div>
    </ThemePersonalization>
  );
}
