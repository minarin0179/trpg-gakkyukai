import { desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, digests } from "@/db";
import { DIGEST_MIN_VOTES } from "./config";
import { GROUP_NAMES } from "./group-style";
import { SITE_URL } from "./site";
import { postToX } from "./x-post";
import { getStatementVoteStats } from "./queries/report";
import {
  DAY_MS,
  DIGEST_BODY_VERSION,
  agreeRatioOf,
  composeDigestText,
  isDigestBody,
  splitDistance,
  voteTotal,
  weekEndKey,
  weekKeyOf,
  weekStartKey,
  weekWindow,
  type DigestBody,
  type DigestConsensus,
  type DigestFeatured,
  type DigestGroup,
  type DigestNewTheme,
  type DigestStatement,
  type DigestThemeStatement,
  type DigestTotals,
} from "./digest-text";

// 週間ダイジェストの集計。週が終わったあとにcron(または管理画面)から1回だけ走らせ、
// 結果を digests テーブルに保存する。ページ側は保存済みの値を読むだけにして、
// 閲覧のたびに重い集計が走らないようにする。
// 週の区切り・型・投稿文の組み立てなど、DBに触れない部分は digest-text.ts にある
export * from "./digest-text";

// ねらいは「これを読めば今週の学級会に追いつける」こと。そのため
//   1) 今週のテーマ(1件ずつ小さなレポート: 人数・グループ・合意・割れた意見)
//   2) サイト全体で新しく賛成が集まった意見
//   3) サイト全体の今週の争点
//   4) 今週始まったテーマ
// の4つで構成する。以前あった「まだ人が少ないテーマ」は、
// 紹介しても中身が無い(票も意見も無い)ため枠ごと外した。

// 「合意」として載せる最低の賛成率。本家Polisのレポートでも合意は高い賛成率で示すため、
// 週の話題として紹介するにはこのくらい強い一致に絞る
const CONSENSUS_MIN_AGREE_RATIO = 0.7;
// 各セクションに載せる件数
const FEATURED_LIMIT = 5;
const NEW_CONSENSUS_LIMIT = 5;
const CONTESTED_LIMIT = 3;
const NEW_THEME_LIMIT = 3;
// サイト全体の候補として一度に読む意見の上限(安全弁)。
// 「その週に票が入り、かつ通算でDIGEST_MIN_VOTES票以上」の意見に限れば
// 現状の規模では数十件に収まるが、際限なく読まないよう蓋をしておく
const SITE_CANDIDATE_LIMIT = 300;

const iso = (d: Date) => d.toISOString();

// 意見1件の集計行(テーマ単位・サイト全体で共通の形)
type StatRow = { id: number; text: string; agree: number; disagree: number; pass: number };

const toDigestStatement = (r: StatRow): DigestStatement => ({
  statementId: r.id,
  text: r.text,
  agree: r.agree,
  disagree: r.disagree,
  pass: r.pass,
});

// 紹介に足る票が集まった意見だけを候補にする。
// 賛成も反対も0(全員がパス)の意見は賛成率が定義できないので外す
const digestCandidates = (rows: StatRow[]): StatRow[] =>
  rows.filter((r) => voteTotal(r) >= DIGEST_MIN_VOTES && r.agree + r.disagree > 0);

// 合意: 賛成率が閾値以上のうち、賛成の実数が最も多いもの。
// 率だけで選ぶと「30票中30票」より「30票中28票」の意見が沈むため、実数を主軸にする
const byAgreeCount = (a: StatRow, b: StatRow) =>
  b.agree - a.agree || voteTotal(b) - voteTotal(a) || a.id - b.id;

// 争点: 50:50 に最も近いもの。同じ隔たりなら票が多いほうを採る
const bySplit = (a: StatRow, b: StatRow) =>
  splitDistance(a) - splitDistance(b) || voteTotal(b) - voteTotal(a) || a.id - b.id;

function pickConsensus(rows: StatRow[]): DigestStatement | null {
  const best = digestCandidates(rows)
    .filter((r) => agreeRatioOf(r) >= CONSENSUS_MIN_AGREE_RATIO)
    .sort(byAgreeCount)[0];
  return best ? toDigestStatement(best) : null;
}

function pickDivisive(rows: StatRow[]): DigestStatement | null {
  const best = digestCandidates(rows).sort(bySplit)[0];
  return best ? toDigestStatement(best) : null;
}

// 前の週のダイジェストに載った意見のID。
// 「新しく賛成が集まった意見」から、先週も紹介した意見を外すために使う。
// 前の週の行が無い(最初の週)・旧形式で読めないときは除外しない
// (その週は候補をそのまま全部「新しい」として扱う)
async function previouslyFeaturedConsensusIds(weekStart: Date): Promise<Set<number>> {
  const prev = await getDigestRow(weekStartKey(new Date(weekStart.getTime() - 7 * DAY_MS)));
  const ids = new Set<number>();
  if (!prev || !isDigestBody(prev.body)) return ids;
  const add = (id: unknown) => {
    if (typeof id === "number" && Number.isFinite(id)) ids.add(id);
  };
  for (const c of prev.body.newConsensus) add(c?.statementId);
  for (const f of prev.body.featured) add(f?.consensus?.statementId);
  return ids;
}

// 意見マップのグループの人数。保存済み計算結果の participants を
// SQL側で展開して数える(参加者1000人規模のJSONBと、身元そのものである
// pidMap をアプリ側へ転送しないため)。グループIDの順に並べて返す
async function loadGroupSizes(themeIds: string[]): Promise<Map<string, DigestGroup[]>> {
  const byTheme = new Map<string, DigestGroup[]>();
  if (themeIds.length === 0) return byTheme;
  const { rows } = await db.execute<{ theme_id: string; cluster: number; n: number }>(sql`
    select m.theme_id, (p->>'cluster')::int as cluster, count(*)::int as n
    from math_results m
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(m.result->'participants') = 'array'
        then m.result->'participants' else '[]'::jsonb end
    ) as p
    where m.theme_id in (${sql.join(
      themeIds.map((id) => sql`${id}`),
      sql`, `,
    )})
      and m.result->>'status' = 'ok'
      and p->>'cluster' is not null
    group by m.theme_id, (p->>'cluster')::int
    order by m.theme_id, (p->>'cluster')::int
  `);
  for (const row of rows) {
    const cluster = Number(row.cluster);
    const list = byTheme.get(row.theme_id) ?? [];
    list.push({ name: GROUP_NAMES[cluster] ?? String(cluster), size: Number(row.n) });
    byTheme.set(row.theme_id, list);
  }
  return byTheme;
}

export async function buildDigest(weekStart: Date, weekEnd: Date): Promise<DigestBody> {
  const start = iso(weekStart);
  const end = iso(weekEnd);

  // 1) 今週のテーマ: その週に投票した人数(重複なし)が多い順に上位5件。
  // 週の動き(今週の人数・意見数)と累計の両方を出し、
  // 「今週どれだけ動いたテーマなのか」が数字で分かるようにする
  const featuredRows = db.execute<{
    id: string;
    title: string;
    week_voters: number;
    week_statements: number;
    total_voters: number;
    total_statements: number;
  }>(sql`
    select t.id, t.title,
      count(distinct v.participant_id)::int as week_voters,
      (select count(*)::int from statements s
        where s.theme_id = t.id and s.status = 'visible'
          and s.created_at >= ${start}::timestamptz
          and s.created_at < ${end}::timestamptz) as week_statements,
      (select count(distinct v2.participant_id)::int from votes v2 where v2.theme_id = t.id)
        as total_voters,
      (select count(*)::int from statements s
        where s.theme_id = t.id and s.status = 'visible') as total_statements
    from votes v
    join themes t on t.id = v.theme_id and t.status = 'active'
    where v.created_at >= ${start}::timestamptz and v.created_at < ${end}::timestamptz
    group by t.id, t.title, t.created_at
    order by week_voters desc, t.created_at desc
    limit ${FEATURED_LIMIT}
  `);

  // 2) サイト全体の候補。「その週に1票以上入った意見」に絞ってから通算の賛否を数える
  // (投票の全件を舐めず、今週動いた意見だけを見る)。
  // 合意・争点はどちらもこの候補から選ぶので、読み出しは1回で済ませる
  const siteRows = db.execute<{
    statement_id: number;
    text: string;
    theme_id: string;
    theme_title: string;
    agree: number;
    disagree: number;
    pass: number;
  }>(sql`
    with touched as (
      select distinct statement_id from votes
      where created_at >= ${start}::timestamptz and created_at < ${end}::timestamptz
    )
    select s.id as statement_id, s.text, s.theme_id, t.title as theme_title,
      count(*) filter (where v.value = 1)::int as agree,
      count(*) filter (where v.value = -1)::int as disagree,
      count(*) filter (where v.value = 0)::int as pass
    from touched
    join statements s on s.id = touched.statement_id and s.status = 'visible'
    join themes t on t.id = s.theme_id and t.status = 'active'
    join votes v on v.statement_id = s.id and v.theme_id = s.theme_id
    group by s.id, s.text, s.theme_id, t.title
    having count(*) >= ${DIGEST_MIN_VOTES}
    order by count(*) desc
    limit ${SITE_CANDIDATE_LIMIT}
  `);

  // 3) その週に生まれたテーマ(人数の多い順に3件)。件数は totals と同じ定義
  const newThemeRows = db.execute<{
    id: string;
    title: string;
    voters: number;
    statements: number;
  }>(sql`
    select t.id, t.title,
      (select count(distinct v.participant_id)::int from votes v where v.theme_id = t.id)
        as voters,
      (select count(*)::int from statements s
        where s.theme_id = t.id and s.status = 'visible') as statements
    from themes t
    where t.status = 'active'
      and t.created_at >= ${start}::timestamptz and t.created_at < ${end}::timestamptz
    order by voters desc, t.created_at desc
    limit ${NEW_THEME_LIMIT}
  `);

  // 4) 週の総量。1本のクエリにまとめて往復を減らす(neon-httpは1クエリ=1往復)
  const totalsRows = db.execute<{
    votes: number;
    statements: number;
    new_themes: number;
    voters: number;
  }>(sql`
    select
      (select count(*)::int from votes
        where created_at >= ${start}::timestamptz and created_at < ${end}::timestamptz)
        as votes,
      (select count(*)::int from statements
        where status = 'visible'
          and created_at >= ${start}::timestamptz and created_at < ${end}::timestamptz)
        as statements,
      (select count(*)::int from themes
        where status = 'active'
          and created_at >= ${start}::timestamptz and created_at < ${end}::timestamptz)
        as new_themes,
      (select count(distinct participant_id)::int from votes
        where created_at >= ${start}::timestamptz and created_at < ${end}::timestamptz)
        as voters
  `);

  const [featuredBase, site, newThemes, totalsResult, previousIds] = await Promise.all([
    featuredRows,
    siteRows,
    newThemeRows,
    totalsRows,
    previouslyFeaturedConsensusIds(weekStart),
  ]);

  // テーマごとの合意・割れた意見は、そのテーマの意見全件の賛否から選ぶ
  // (今週入った票だけでなく通算の賛否で見る。テーマの現在の状態を伝えるため)。
  // 対象は最大5テーマなので、意見の集計はテーマ単位の既存クエリを使い回す
  const themeIds = featuredBase.rows.map((r) => r.id);
  const [groupSizes, ...perThemeStats] = await Promise.all([
    loadGroupSizes(themeIds),
    ...themeIds.map((id) => getStatementVoteStats(id)),
  ]);

  const featured: DigestFeatured[] = featuredBase.rows.map((row, i) => {
    const stats: StatRow[] = (perThemeStats[i] ?? []).map((s) => ({
      id: s.id,
      text: s.text,
      agree: Number(s.agree),
      disagree: Number(s.disagree),
      pass: Number(s.pass),
    }));
    return {
      id: row.id,
      title: row.title,
      weekVoters: Number(row.week_voters),
      weekStatements: Number(row.week_statements),
      totalVoters: Number(row.total_voters),
      totalStatements: Number(row.total_statements),
      groups: groupSizes.get(row.id) ?? null,
      consensus: pickConsensus(stats),
      divisive: pickDivisive(stats),
    };
  });

  // サイト全体の候補を、意見IDを主キーとする共通の形に直す
  const siteCandidates = site.rows.map((r) => ({
    row: {
      id: Number(r.statement_id),
      text: r.text,
      agree: Number(r.agree),
      disagree: Number(r.disagree),
      pass: Number(r.pass),
    } satisfies StatRow,
    themeId: r.theme_id,
    themeTitle: r.theme_title,
  }));

  const toThemeStatement = (c: (typeof siteCandidates)[number]): DigestThemeStatement => ({
    themeId: c.themeId,
    themeTitle: c.themeTitle,
    ...toDigestStatement(c.row),
  });

  // 新しく賛成が集まった意見。math_results の consensus は賛成率だけで
  // 票数を持たないため、ここでは使わずに実際の票数から選ぶ。
  // 「新しい」は「前の週のダイジェストに載っていない」で判定する
  const newConsensus: DigestConsensus[] = siteCandidates
    .filter(
      (c) =>
        voteTotal(c.row) >= DIGEST_MIN_VOTES &&
        c.row.agree + c.row.disagree > 0 &&
        agreeRatioOf(c.row) >= CONSENSUS_MIN_AGREE_RATIO &&
        !previousIds.has(c.row.id),
    )
    .sort((a, b) => byAgreeCount(a.row, b.row))
    .slice(0, NEW_CONSENSUS_LIMIT)
    .map((c) => ({ ...toThemeStatement(c), agreeRatio: agreeRatioOf(c.row) }));

  // 今週の争点。テーマごとの「割れた意見」で既に出した意見は繰り返さない
  const shownDivisive = new Set(
    featured.flatMap((f) => (f.divisive ? [f.divisive.statementId] : [])),
  );
  const contested: DigestThemeStatement[] = siteCandidates
    .filter(
      (c) =>
        voteTotal(c.row) >= DIGEST_MIN_VOTES &&
        c.row.agree + c.row.disagree > 0 &&
        !shownDivisive.has(c.row.id),
    )
    .sort((a, b) => bySplit(a.row, b.row))
    .slice(0, CONTESTED_LIMIT)
    .map(toThemeStatement);

  const t = totalsResult.rows[0];
  const totals: DigestTotals = {
    votes: Number(t?.votes ?? 0),
    statements: Number(t?.statements ?? 0),
    newThemes: Number(t?.new_themes ?? 0),
    voters: Number(t?.voters ?? 0),
  };

  const newThemeItems: DigestNewTheme[] = newThemes.rows.map((r) => ({
    id: r.id,
    title: r.title,
    voters: Number(r.voters),
    statements: Number(r.statements),
  }));

  return {
    version: DIGEST_BODY_VERSION,
    weekStart: weekStartKey(weekStart),
    weekEnd: weekEndKey(weekStart),
    totals,
    featured,
    newConsensus,
    contested,
    // 件数は「その週に作られたactiveなテーマ」で totals と同じ定義なので使い回す
    newThemes: { count: totals.newThemes, items: newThemeItems },
  };
}

export function digestUrl(weekKey: string): string {
  return `${SITE_URL}/digest/${weekKey}`;
}

// 集計して保存し、ダイジェストのISRページを更新する。
// cron と管理画面の「再生成」で同じ処理を使う(集計の定義を1か所に保つ)。
// 既にある週は上書きするが、投稿の記録(postedAt / postId / postError)は残す
export async function generateAndStoreDigest(
  weekStartInput: Date,
): Promise<{ weekStart: string; weekKey: string; text: string; body: DigestBody }> {
  const { weekStart, weekEnd } = weekWindow(weekStartInput);
  const body = await buildDigest(weekStart, weekEnd);
  // URLに使う週キーは body には持たせず、主キー(週の月曜)から毎回導く
  const weekKey = weekKeyOf(body.weekStart);
  const text = composeDigestText(body, digestUrl(weekKey));

  await db
    .insert(digests)
    .values({ weekStart: body.weekStart, body, text })
    .onConflictDoUpdate({ target: digests.weekStart, set: { body, text } });

  revalidateDigest(weekKey);
  return { weekStart: body.weekStart, weekKey, text, body };
}

// ダイジェストのISRページ(一覧・週ページ・RSS)をまとめて無効化する
export function revalidateDigest(weekKey: string): void {
  revalidatePath("/digest");
  revalidatePath(`/digest/${weekKey}`);
  revalidatePath("/digest/feed.xml");
}

// 保存済みダイジェストの読み出し(ページ・RSS・管理画面が使う)。
// body は jsonb なので、使う側で isDigestBody を通してから読むこと
export type DigestRow = typeof digests.$inferSelect;

export async function getDigestRow(weekStart: string): Promise<DigestRow | null> {
  const [row] = await db.select().from(digests).where(eq(digests.weekStart, weekStart));
  return row ?? null;
}

// 一覧・RSS・管理画面はこれで読む。digestsテーブルがまだ無い(マイグレーション前の)
// 環境でもページのビルドが落ちないよう、失敗は空一覧として扱う
export async function listDigestRows(limit: number): Promise<DigestRow[]> {
  try {
    return await db.select().from(digests).orderBy(desc(digests.weekStart)).limit(limit);
  } catch (e) {
    console.error("failed to list digests:", e);
    return [];
  }
}

// Xへの投稿。成功なら投稿ID、失敗なら理由を記録して、管理画面から結果が見えるようにする。
// 例外は投げず、呼び出し側(cron・管理画面)は結果を見て表示を変える。
// 秘密は x-post.ts の中だけで扱うため、ここには記録されない
export async function postDigestToX(
  row: DigestRow,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const { id } = await postToX(row.text);
    await db
      .update(digests)
      .set({ postedAt: new Date(), postId: id, postError: null })
      .where(eq(digests.weekStart, row.weekStart));
    return { ok: true, id };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db
      .update(digests)
      .set({ postError: error })
      .where(eq(digests.weekStart, row.weekStart));
    return { ok: false, error };
  }
}
