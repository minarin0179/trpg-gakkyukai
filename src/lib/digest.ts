import { sql } from "drizzle-orm";
import { db } from "@/db";
import { SITE_URL } from "./site";
import {
  DIGEST_THEME_LIMIT,
  composeDigestText,
  weekEndKey,
  weekKeyOf,
  weekStartKey,
  weekWindow,
  type WeeklyPost,
  type WeeklyPostTheme,
} from "./digest-text";

// 週に一度のX投稿のための集計。結果はどこにも保存せず、投稿するそのときに
// 前の週を数え直す(週1回の投稿のためにテーブルを1つ抱えるより、
// 数クエリを都度走らせるほうが運用が軽い)。
// 週の区切り・型・投稿文の組み立てなど、DBに触れない部分は digest-text.ts にある
export * from "./digest-text";

const iso = (d: Date) => d.toISOString();

// 投稿から送る先。載せたタイトルの続き(今動いているテーマ)がそのまま並ぶ人気タブにする
export const DIGEST_LINK_URL = `${SITE_URL}/themes?tab=active`;

// その週に投票した人数(重複なし)が多かったテーマを取る。同数なら新しいテーマを先に出す。
// 投稿に載せるのはタイトルだけなので、必要な集計はこの1本で足りる
export async function buildWeeklyPost(weekStartInput: Date): Promise<WeeklyPost> {
  const { weekStart, weekEnd } = weekWindow(weekStartInput);
  const start = iso(weekStart);
  const end = iso(weekEnd);

  const result = await db.execute<{ id: string; title: string; week_voters: number }>(sql`
    select t.id, t.title, count(distinct v.participant_id)::int as week_voters
    from votes v
    join themes t on t.id = v.theme_id and t.status = 'active'
    where v.created_at >= ${start}::timestamptz and v.created_at < ${end}::timestamptz
    group by t.id, t.title, t.created_at
    order by week_voters desc, t.created_at desc
    limit ${DIGEST_THEME_LIMIT}
  `);

  const themes: WeeklyPostTheme[] = result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    weekVoters: Number(row.week_voters),
  }));

  return {
    weekStart: weekStartKey(weekStart),
    weekEnd: weekEndKey(weekStart),
    themes,
  };
}

// 集計から投稿文までをまとめて作る。cronと管理画面で同じ処理を使い、
// 自動投稿と手動投稿で中身が食い違わないようにする
export async function buildWeeklyPostText(weekStartInput: Date): Promise<{
  weekStart: string;
  weekKey: string;
  text: string;
  post: WeeklyPost;
}> {
  const post = await buildWeeklyPost(weekStartInput);
  return {
    weekStart: post.weekStart,
    weekKey: weekKeyOf(post.weekStart),
    text: composeDigestText(post, DIGEST_LINK_URL),
    post,
  };
}
