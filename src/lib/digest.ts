import { desc, eq, sql } from "drizzle-orm";
import { db, digests } from "@/db";
import { SITE_URL } from "./site";
import { postToX } from "./x-post";
import {
  DIGEST_BODY_VERSION,
  DIGEST_THEME_LIMIT,
  composeDigestText,
  weekEndKey,
  weekKeyOf,
  weekStartKey,
  weekWindow,
  type DigestBody,
  type DigestTheme,
  type DigestTotals,
} from "./digest-text";

// 週に一度のX投稿のための集計。週が終わったあとにcron(または管理画面)から
// 1回だけ走らせ、結果と投稿文を digests テーブルに保存する。
// 週の区切り・型・投稿文の組み立てなど、DBに触れない部分は digest-text.ts にある
export * from "./digest-text";

const iso = (d: Date) => d.toISOString();

// 投稿に載せるのは「先週よく話されたテーマの名前」だけ。
// 意見の紹介や合意・争点の抽出はやめたので、必要なのは
// 「その週の総量(記録用)」と「投票した人数が多かったテーマ」の2つに絞れる
export async function buildDigest(weekStart: Date, weekEnd: Date): Promise<DigestBody> {
  const start = iso(weekStart);
  const end = iso(weekEnd);

  // 1) 投票が多かったテーマ: その週に投票した人数(重複なし)が多い順。
  // 同数なら新しいテーマを先に出す
  const themeRows = db.execute<{ id: string; title: string; week_voters: number }>(sql`
    select t.id, t.title, count(distinct v.participant_id)::int as week_voters
    from votes v
    join themes t on t.id = v.theme_id and t.status = 'active'
    where v.created_at >= ${start}::timestamptz and v.created_at < ${end}::timestamptz
    group by t.id, t.title, t.created_at
    order by week_voters desc, t.created_at desc
    limit ${DIGEST_THEME_LIMIT}
  `);

  // 2) 週の総量。1本のクエリにまとめて往復を減らす(neon-httpは1クエリ=1往復)
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

  const [themeResult, totalsResult] = await Promise.all([themeRows, totalsRows]);

  const themes: DigestTheme[] = themeResult.rows.map((row) => ({
    id: row.id,
    title: row.title,
    weekVoters: Number(row.week_voters),
  }));

  const t = totalsResult.rows[0];
  const totals: DigestTotals = {
    votes: Number(t?.votes ?? 0),
    statements: Number(t?.statements ?? 0),
    newThemes: Number(t?.new_themes ?? 0),
    voters: Number(t?.voters ?? 0),
  };

  return {
    version: DIGEST_BODY_VERSION,
    weekStart: weekStartKey(weekStart),
    weekEnd: weekEndKey(weekStart),
    totals,
    themes,
  };
}

// 投稿から送る先。載せたタイトルの続き(今動いているテーマ)がそのまま並ぶ人気タブにする
export const DIGEST_LINK_URL = `${SITE_URL}/themes?tab=active`;

// 集計して保存する。cron と管理画面の「再生成」で同じ処理を使う(定義を1か所に保つ)。
// 既にある週は上書きするが、投稿の記録(postedAt / postId / postError)は残す
export async function generateAndStoreDigest(
  weekStartInput: Date,
): Promise<{ weekStart: string; weekKey: string; text: string; body: DigestBody }> {
  const { weekStart, weekEnd } = weekWindow(weekStartInput);
  const body = await buildDigest(weekStart, weekEnd);
  // 週キーは body には持たせず、主キー(週の月曜)から毎回導く
  const weekKey = weekKeyOf(body.weekStart);
  const text = composeDigestText(body, DIGEST_LINK_URL);

  await db
    .insert(digests)
    .values({ weekStart: body.weekStart, body, text })
    .onConflictDoUpdate({ target: digests.weekStart, set: { body, text } });

  return { weekStart: body.weekStart, weekKey, text, body };
}

// 保存済みの行の読み出し(cron・管理画面が使う)。
// body は jsonb なので、使う側で isDigestBody を通してから読むこと
export type DigestRow = typeof digests.$inferSelect;

export async function getDigestRow(weekStart: string): Promise<DigestRow | null> {
  const [row] = await db.select().from(digests).where(eq(digests.weekStart, weekStart));
  return row ?? null;
}

// 管理画面の一覧はこれで読む。digestsテーブルがまだ無い(マイグレーション前の)
// 環境でもページが落ちないよう、失敗は空一覧として扱う
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
