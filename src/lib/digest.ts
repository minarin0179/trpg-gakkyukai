import { desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, digests } from "@/db";
import { PROMOTION_MIN_PARTICIPANTS } from "./config";
import { SITE_URL } from "./site";
import { postToX } from "./x-post";
import {
  composeDigestText,
  formatWeekRange,
  isoWeekKey,
  weekStartKey,
  weekWindow,
  type DigestBody,
  type DigestConsensus,
  type DigestTheme,
  type DigestTotals,
} from "./digest-text";

// 週間ダイジェストの集計。週が終わったあとにcron(または管理画面)から1回だけ走らせ、
// 結果を digests テーブルに保存する。ページ側は保存済みの値を読むだけにして、
// 閲覧のたびに重い集計が走らないようにする。
// 週の区切り・投稿文の組み立てなど、DBに触れない部分は digest-text.ts にある
export * from "./digest-text";

// 「合意」として載せる最低の賛成率。本家Polisのレポートでも合意は高い賛成率で示すため、
// 週の話題として紹介するにはこのくらい強い一致に絞る
const CONSENSUS_MIN_AGREE_RATIO = 0.7;
// 意見マップが2グループ以上に割れたテーマだけを対象にする。
// 「立場が違う人どうしでも一致した」ことがダイジェストの価値なので、
// 1グループしか出ていないテーマの合意は対象外
const CONSENSUS_MIN_GROUPS = 2;
// 投稿文・ページに載せる件数
const MOST_VOTED_LIMIT = 5;
const CONSENSUS_LIMIT = 3;
const QUIET_LIMIT = 3;
// 意見の本文は長いので、ダイジェストでは先頭だけを載せる
const STATEMENT_SNIPPET_MAX = 60;

const iso = (d: Date) => d.toISOString();

export async function buildDigest(weekStart: Date, weekEnd: Date): Promise<DigestBody> {
  const start = iso(weekStart);
  const end = iso(weekEnd);

  // 1) その週に投票が入ったテーマを、投票した人数(重複なし)の多い順に
  const mostVotedRows = await db.execute<{
    id: string;
    title: string;
    voter_count: number;
    statement_count: number;
  }>(sql`
    select t.id, t.title,
      count(distinct v.participant_id)::int as voter_count,
      (select count(*)::int from statements s
        where s.theme_id = t.id and s.status = 'visible') as statement_count
    from votes v
    join themes t on t.id = v.theme_id and t.status = 'active'
    where v.created_at >= ${start}::timestamptz and v.created_at < ${end}::timestamptz
    group by t.id, t.title, t.created_at
    order by voter_count desc, t.created_at desc
    limit ${MOST_VOTED_LIMIT}
  `);

  // 2) その週に「見つかった」合意。
  // 計算結果(math_results)はテーマごとに最新1件しか持たないため、
  // 「いつ合意になったか」は分からない。そこで「その週に計算されたテーマの合意」を
  // 新しい合意とみなす(週に一度は再計算が走るので、実用上は十分近い)
  const consensusRows = await db.execute<{
    theme_id: string;
    title: string;
    statement_id: number;
    agree_ratio: number;
    text: string;
  }>(sql`
    select m.theme_id, t.title, (c->>'statement_id')::int as statement_id,
      (c->>'agree_ratio')::float8 as agree_ratio, s.text
    from math_results m
    join themes t on t.id = m.theme_id and t.status = 'active'
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(m.result->'consensus'->'agree') = 'array'
        then m.result->'consensus'->'agree' else '[]'::jsonb end
    ) as c
    join statements s on s.id = (c->>'statement_id')::int and s.status = 'visible'
    where m.computed_at >= ${start}::timestamptz and m.computed_at < ${end}::timestamptz
      and coalesce((m.result->>'group_count')::int, 0) >= ${CONSENSUS_MIN_GROUPS}
      and (c->>'agree_ratio')::float8 >= ${CONSENSUS_MIN_AGREE_RATIO}
    order by agree_ratio desc, m.theme_id
    limit ${CONSENSUS_LIMIT}
  `);

  // 3) その週に生まれた、まだ人が少ないテーマ(人気タブに載る人数に届いていないもの)。
  // 参加が集まらないまま埋もれるのを防ぐのがこの枠の目的
  const quietRows = await db.execute<{
    id: string;
    title: string;
    voter_count: number;
    statement_count: number;
  }>(sql`
    select * from (
      select t.id, t.title, t.created_at,
        (select count(distinct v.participant_id)::int from votes v where v.theme_id = t.id)
          as voter_count,
        (select count(*)::int from statements s
          where s.theme_id = t.id and s.status = 'visible') as statement_count
      from themes t
      where t.status = 'active'
        and t.created_at >= ${start}::timestamptz and t.created_at < ${end}::timestamptz
    ) q
    where q.voter_count < ${PROMOTION_MIN_PARTICIPANTS}
    order by q.created_at desc
    limit ${QUIET_LIMIT}
  `);

  // 4) 週の総量。1本のクエリにまとめて往復を減らす(neon-httpは1クエリ=1往復)
  const totalsRows = await db.execute<DigestTotals>(sql`
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
        as themes,
      (select count(distinct participant_id)::int from votes
        where created_at >= ${start}::timestamptz and created_at < ${end}::timestamptz)
        as voters
  `);

  const toTheme = (r: {
    id: string;
    title: string;
    voter_count: number;
    statement_count: number;
  }): DigestTheme => ({
    id: r.id,
    title: r.title,
    voterCount: Number(r.voter_count),
    statementCount: Number(r.statement_count),
  });

  const newConsensus: DigestConsensus[] = consensusRows.rows.map((r) => ({
    themeId: r.theme_id,
    themeTitle: r.title,
    statementId: Number(r.statement_id),
    text: r.text.slice(0, STATEMENT_SNIPPET_MAX),
    agreeRatio: Number(r.agree_ratio),
  }));

  const t = totalsRows.rows[0];
  return {
    weekStart: weekStartKey(weekStart),
    weekKey: isoWeekKey(weekStart),
    range: formatWeekRange(weekStart),
    mostVoted: mostVotedRows.rows.map(toTheme),
    newConsensus,
    quietNew: quietRows.rows.map(toTheme),
    totals: {
      votes: Number(t?.votes ?? 0),
      statements: Number(t?.statements ?? 0),
      themes: Number(t?.themes ?? 0),
      voters: Number(t?.voters ?? 0),
    },
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
  const text = composeDigestText(body, digestUrl(body.weekKey));

  await db
    .insert(digests)
    .values({ weekStart: body.weekStart, body, text })
    .onConflictDoUpdate({ target: digests.weekStart, set: { body, text } });

  revalidateDigest(body.weekKey);
  return { weekStart: body.weekStart, weekKey: body.weekKey, text, body };
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
