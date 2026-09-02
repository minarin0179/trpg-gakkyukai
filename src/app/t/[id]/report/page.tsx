import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getTheme,
  getThemeCounts,
  getStatementVoteStats,
  getMathResult,
  getGroupVoteBreakdown,
  type GroupBreakdown,
  type GroupVoteCounts,
} from "@/lib/queries";
import { OpinionMap } from "@/components/OpinionMap";
import { toMapPayload, toPublicMathResult } from "@/lib/math-result";
import { MAP_MIN_VOTES, CHART_MIN_ITEMS } from "@/lib/config";
import { GROUP_COLORS, GROUP_NAMES } from "@/lib/group-style";
import { groupsLackingAgreeRepness } from "@/lib/repness";
import { StatementBeeswarm } from "@/components/StatementBeeswarm";
import { ShareTheme } from "@/components/ShareTheme";
import { StatementMap } from "@/components/StatementMap";

// 各意見の投票内訳(本家Polisのレポート画面に相当する公開集計)。
// 構成: 概況 → グループを越えた合意 → 意見グループ → すべての意見。
// 多数決と誤読される「多数派」の切り口は置かず、グループを越えた合意を前面に出す。
// 意見ごとに全体とグループ別の内訳を本家レポートのように横並びで比較できるようにする。
// 投票・訂正のUIとはページを分離する: 割合を見ながら自分の投票を直す動線を
// 作らないための設計判断(要望テーマ spin_ihvaFbg の議論より)。
// 全員に同じ内容なのでISRでCDN共有し、鮮度は5分で十分とする
export const revalidate = 300;

// 各セクションで畳まずに見せる件数
const SECTION_PREVIEW = 5;
// 割れ方・地図に載せる意見の最低投票数(少票の割合はノイズが大きい)。
// 意見マップに載る基準と同じ値を使う
const SECTION_MIN_VOTES = MAP_MIN_VOTES;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: PageProps<"/t/[id]/report">): Promise<Metadata> {
  const { id } = await params;
  const theme = await getTheme(id).catch(() => null);
  if (!theme) return {};
  return {
    title: `結果レポート — ${theme.title}`,
    robots: { index: false },
  };
}

type Stat = { id: number; text: string; agree: number; disagree: number; pass: number };

const total = (s: { agree: number; disagree: number; pass: number }) =>
  s.agree + s.disagree + s.pass;
const pct = (n: number, t: number) => (t > 0 ? Math.round((n / t) * 100) : 0);

// 賛成/反対/パスの割合バー(1本)。
// scale(0〜1)を渡すと色付き部分の全長をその比率にする。「すべての意見」では
// 最多得票の意見を1として票数比にし、棒の長さで票数の多寡も読めるようにする
function VoteBar({
  s,
  scale = 1,
}: {
  s: { agree: number; disagree: number; pass: number };
  scale?: number;
}) {
  const t = total(s);
  return (
    <div className="h-2 rounded-full bg-stone-100">
      {t > 0 && (
        <div
          className="flex h-2 overflow-hidden rounded-full"
          role="img"
          aria-label={`賛成${pct(s.agree, t)}パーセント、反対${pct(s.disagree, t)}パーセント、パス${pct(s.pass, t)}パーセント、計${t}票`}
          style={scale < 1 ? { width: `${Math.max(2, scale * 100)}%` } : undefined}
        >
          <div className="bg-emerald-600" style={{ width: `${(s.agree / t) * 100}%` }} />
          <div className="bg-rose-600" style={{ width: `${(s.disagree / t) * 100}%` }} />
          <div className="bg-stone-400" style={{ width: `${(s.pass / t) * 100}%` }} />
        </div>
      )}
    </div>
  );
}

// 賛成 · 反対 · パスの数値(色は凡例と共通)
function VoteNumbers({ s }: { s: { agree: number; disagree: number; pass: number } }) {
  const t = total(s);
  if (t === 0) return <p className="mt-0.5 text-[11px] text-stone-500">投票なし</p>;
  return (
    <p className="mt-0.5 text-[11px] tabular-nums text-stone-600">
      <span className="font-medium text-emerald-700">{pct(s.agree, t)}%</span>{" "}
      <span className="font-medium text-rose-700">{pct(s.disagree, t)}%</span>{" "}
      <span>{pct(s.pass, t)}%</span> <span>({t}票)</span>
    </p>
  );
}

// 本家レポート式の横並び比較: 全体 + 各グループの内訳を1行に並べる。
// highlightGroup はそのグループのセクション内で自分の列を目立たせるのに使う
// 列ごとの最大票数(全体・各グループ)。渡すと棒の長さを票数比にする
type BarMaxima = { overall: number; groups: number[] };
// 見え方の検討用の切り替え(確定後に片方へ固定する)
const GROUP_BAR_BASE: "overall" | "largest-group" = "largest-group";
const SCALE_ACROSS_STATEMENTS = true;

function CompareBars({
  s,
  groups,
  highlightGroup,
  maxima,
}: {
  s: Stat;
  groups: { counts: GroupVoteCounts; size: number }[] | null;
  highlightGroup?: number;
  maxima?: BarMaxima;
}) {
  // グループの棒の長さの基準。
  //   "overall": 全体の棒を100%とし、各グループは全体に占める票数の割合(グループの棒が全体の分割に見える)
  //   "largest-group": 最大グループを100%とし、他グループはその比
  // どちらもグループ同士の長さの比 = 票数(≒人数)の比になる
  const overallTotal = total(s);
  const groupMax = groups ? Math.max(0, ...groups.map((g) => total(g.counts))) : 0;
  const groupBase = GROUP_BAR_BASE === "overall" ? overallTotal : groupMax;
  // 全体の棒: 意見間の票数比(maxima があるとき)
  const overallScale =
    SCALE_ACROSS_STATEMENTS && maxima && maxima.overall > 0
      ? Math.min(1, overallTotal / maxima.overall)
      : 1;
  const cols: {
    label: string;
    color?: string;
    counts: GroupVoteCounts;
    highlight: boolean;
    scale: number;
  }[] = [{ label: "全体", counts: s, highlight: false, scale: overallScale }];
  if (groups) {
    for (const [g, { counts }] of groups.entries()) {
      cols.push({
        label: `グループ${GROUP_NAMES[g] ?? g}`,
        color: GROUP_COLORS[g % GROUP_COLORS.length],
        counts,
        highlight: highlightGroup === g,
        // グループの棒は全体の棒と同じ縮尺に載せる(全体が縮んでいればグループも縮む)
        scale: groupBase > 0 ? Math.min(1, total(counts) / groupBase) * overallScale : 1,
      });
    }
  }
  return (
    <div className="mt-2 grid gap-x-3 gap-y-2 [grid-template-columns:repeat(auto-fit,minmax(7.5rem,1fr))]">
      {cols.map((c) => (
        <div
          key={c.label}
          className={c.highlight ? "-mx-1 rounded-md bg-stone-100 px-1 py-0.5" : ""}
        >
          <p
            className="mb-1 text-[11px] font-medium text-stone-600"
            style={c.color ? { color: c.color } : undefined}
          >
            {c.label}
          </p>
          <VoteBar s={c.counts} scale={c.scale} />
          <VoteNumbers s={c.counts} />
        </div>
      ))}
    </div>
  );
}

function SectionHeading({ title, note }: { title: string; note: string }) {
  return (
    <div>
      <h2 className="text-base font-bold">{title}</h2>
      <p className="mt-0.5 text-xs leading-relaxed text-stone-600">{note}</p>
    </div>
  );
}

export default async function ResultsPage({ params }: PageProps<"/t/[id]/report">) {
  const { id } = await params;
  const theme = await getTheme(id);
  if (!theme) notFound();

  const [stats, counts, mathRow] = await Promise.all([
    getStatementVoteStats(id),
    getThemeCounts(id),
    getMathResult(id).catch(() => null),
  ]);
  const breakdown = await getGroupVoteBreakdown(id, mathRow ?? undefined).catch(
    (): GroupBreakdown | null => null,
  );

  // 意見マップの再掲用(客観表示)。pidMap は参加者の身元なのでクライアントに渡さない。
  // 不成立(insufficient)のときは再掲しない(このページは集計を見せる場のため)
  const parsedResult = toPublicMathResult(mathRow?.result ?? null);
  const publicResult = parsedResult?.status === "ok" ? parsedResult : null;
  const statementTexts: Record<number, string> = {};
  for (const s of stats) statementTexts[s.id] = s.text;
  const statById = new Map(stats.map((s) => [s.id, s]));
  const totalVotes = stats.reduce((sum, s) => sum + total(s), 0);

  // 意見ごとの「全体+グループ別」列データを組み立てる(グループ未成立なら全体のみ)
  const groupsFor = (sid: number) =>
    breakdown
      ? breakdown.groupSizes.map((size, g) => ({
          size,
          counts: breakdown.byStatement[sid]?.[g] ?? { agree: 0, disagree: 0, pass: 0 },
        }))
      : null;

  const card = (s: Stat, highlightGroup?: number, maxima?: BarMaxima) => (
    <li
      key={s.id}
      className="rounded-md border border-stone-400 bg-white px-3 py-2 text-sm"
    >
      <p>{s.text}</p>
      <CompareBars s={s} groups={groupsFor(s.id)} highlightGroup={highlightGroup} maxima={maxima} />
    </li>
  );

  // 「すべての意見」用: 列ごとの最大票数。最多得票の意見を1として棒の長さを票数比にする
  const allMaxima: BarMaxima = {
    overall: Math.max(0, ...stats.map((s) => total(s))),
    groups: (groupsFor(stats[0]?.id ?? -1) ?? []).map((_, g) =>
      Math.max(0, ...stats.map((s) => total(groupsFor(s.id)?.[g]?.counts ?? { agree: 0, disagree: 0, pass: 0 }))),
    ),
  };

  // 先頭数件+残りは折りたたみ
  const previewList = (items: Stat[]) => (
    <>
      <ul className="flex flex-col gap-3">{items.slice(0, SECTION_PREVIEW).map((s) => card(s))}</ul>
      {items.length > SECTION_PREVIEW && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-stone-600 underline">
            残り{items.length - SECTION_PREVIEW}件を見る
          </summary>
          <ul className="mt-2 flex flex-col gap-3">
            {items.slice(SECTION_PREVIEW).map((s) => card(s))}
          </ul>
        </details>
      )}
    </>
  );

  // グループを越えた合意(計算結果の group-informed consensus を本文に解決)
  const resolve = (ids: number[]) =>
    ids.map((sid) => statById.get(sid)).filter((s): s is Stat => s !== undefined);
  const consensusAgree = breakdown ? resolve(breakdown.consensus.agree) : [];
  const consensusDisagree = breakdown ? resolve(breakdown.consensus.disagree) : [];

  // 「特に賛成する意見」が相対的に少ないグループ(投稿の呼びかけ用)
  const lackingAgreeGroups = breakdown
    ? groupsLackingAgreeRepness(breakdown.repness, breakdown.groupCount, (sid) =>
        statById.has(sid),
      )
    : [];

  // 意見の割れ方(beeswarm)と意見コンパスのデータ
  const beeswarmItems = stats
    .filter((s) => total(s) >= SECTION_MIN_VOTES && s.agree + s.disagree > 0)
    .map((s) => ({ ...s, byGroup: breakdown?.byStatement[s.id] ?? null }));
  const mapItems = breakdown
    ? stats
        .filter((s) => total(s) >= SECTION_MIN_VOTES && breakdown.statementXY[s.id])
        .map((s) => ({
          ...s,
          x: breakdown.statementXY[s.id][0],
          y: breakdown.statementXY[s.id][1],
          byGroup: breakdown.byStatement[s.id] ?? null,
        }))
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/t/${theme.id}`}
          prefetch={false}
          className="text-xs text-stone-600 underline"
        >
          テーマに戻る
        </Link>
        {/* タイトルが1行で収まるならボタンを横並び、収まらないならボタンを下の行へ。
            h1の基準幅をmax-content(=1行で置いた場合の幅)にすることで、flex-wrapが
            「テキストを折り返してでも同じ行に押し込む」のではなく行ごと分ける */}
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h1 className="max-w-full text-xl font-bold [flex-basis:max-content]">{theme.title}</h1>
          <ShareTheme themeId={theme.id} title={theme.title} variant="report" appearance="button" />
        </div>
      </div>

      {/* 概況(本家レポートの Overview に相当) */}
      <div className="rounded-md border border-stone-400 bg-white px-3 py-2 text-sm">
        <p>
          {counts.voterCount}人が投票 · 意見{stats.length}件 · {totalVotes}票
          {breakdown && (
            <>
              {" · "}意見グループ{breakdown.groupCount}つ(
              {breakdown.groupSizes.map((n, g) => (
                <span key={g}>
                  {g > 0 && "、"}
                  <span
                    className="mr-1 inline-block h-2 w-2 rounded-full align-baseline"
                    style={{ backgroundColor: GROUP_COLORS[g % GROUP_COLORS.length] }}
                  />
                  {GROUP_NAMES[g] ?? g}: {n}人
                </span>
              ))}
              )
            </>
          )}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-stone-600">
          集計は約5分ごとに更新。割合は多数決の結果ではなく、意見の分布を見るための参考情報です。
          数値は左から
          <span className="font-medium text-emerald-700">賛成</span>・
          <span className="font-medium text-rose-700">反対</span>・パスの割合。
        </p>
      </div>

      {publicResult && (
        <section className="flex flex-col gap-3">
          <SectionHeading
            title="意見マップ"
            note="テーマページの意見マップと同じもので、点はひとりの参加者。投票の傾向が近い人ほど近くに置かれます。このページは全員に同じ内容のレポートのため、自分の位置は表示されません。"
          />
          <OpinionMap
            result={toMapPayload(publicResult)}
            statementTexts={statementTexts}
            variant="report"
          />
        </section>
      )}

      {mapItems.length >= CHART_MIN_ITEMS && breakdown && (
        <section className="flex flex-col gap-3">
          <SectionHeading
            title="意見コンパス"
            note="投票のされ方が似ている意見ほど近くに置かれ、文字はそれぞれの意見グループがいる方向です。詳しい読み方は図の下の「コンパスの見方」へ。"
          />
          <StatementMap items={mapItems} groupDirections={breakdown.groupDirections} />
        </section>
      )}

      {beeswarmItems.length >= CHART_MIN_ITEMS && (
        <section className="flex flex-col gap-3">
          <SectionHeading
            title="この議論はどれくらい意見が割れたか"
            note={`各意見を賛否の割れ具合で並べたものです。左端は投票した全員が同じ方向(全員賛成または全員反対)、右端は賛成と反対が真っ二つ。色は全体での賛否の向き(緑=賛成が多い、赤=反対が多い)。パスは割れ具合の計算に含めていません(${SECTION_MIN_VOTES}票以上の意見のみ)。`}
          />
          <StatementBeeswarm items={beeswarmItems} />
        </section>
      )}

      {(consensusAgree.length > 0 || consensusDisagree.length > 0) && (
        <section className="flex flex-col gap-3">
          <SectionHeading
            title="グループを越えた合意"
            note="立場の異なるどの意見グループでも同じ方向が多数だった意見です。この議論で見つかった共通の足場と言えます。"
          />
          {consensusAgree.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-emerald-700">
                賛成で一致
              </h3>
              {previewList(consensusAgree)}
            </>
          )}
          {consensusDisagree.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-rose-700">
                反対で一致
              </h3>
              {previewList(consensusDisagree)}
            </>
          )}
        </section>
      )}

      {breakdown && (
        <section className="flex flex-col gap-4">
          <SectionHeading
            title="意見グループ"
            note="投票の傾向が近い人のまとまりごとに、そのグループを特徴づける意見(グループ内の投票が全体と大きく異なる意見)を示します。"
          />
          {breakdown.groupSizes.map((size, g) => {
            const reps = (breakdown.repness[String(g)] ?? [])
              .map((r) => statById.get(r.statement_id))
              .filter((s): s is Stat => s !== undefined);
            const missingAgree = lackingAgreeGroups.includes(g);
            if (reps.length === 0 && !missingAgree) return null;
            const color = GROUP_COLORS[g % GROUP_COLORS.length];
            return (
              <div key={g}>
                <h3 className="mb-2 text-sm font-semibold" style={{ color }}>
                  <span
                    className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-baseline"
                    style={{ backgroundColor: color }}
                  />
                  グループ{GROUP_NAMES[g] ?? g}({size}人)
                </h3>
                {reps.length > 0 && (
                  <ul className="flex flex-col gap-3">{reps.map((s) => card(s, g))}</ul>
                )}
                {missingAgree && (
                  <p className="mt-2 rounded-md border border-dashed border-stone-400 bg-stone-50 px-3 py-2 text-xs leading-relaxed text-stone-700">
                    グループ{GROUP_NAMES[g] ?? g}が特に賛成する意見は、他のグループに比べてまだ少ないようです。
                    このグループの気持ちを代弁する意見が増えると、合意や違いがより正確に見えてきます。
                    <Link
                      href={`/t/${theme.id}#post`}
                      prefetch={false}
                      className="ml-1 underline"
                    >
                      テーマページで意見を投稿する
                    </Link>
                  </p>
                )}
              </div>
            );
          })}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionHeading title="すべての意見" note="このテーマに投稿された意見の一覧です。" />
        <ul className="flex flex-col gap-3">{stats.map((s) => card(s, undefined, allMaxima))}</ul>
      </section>
    </div>
  );
}
