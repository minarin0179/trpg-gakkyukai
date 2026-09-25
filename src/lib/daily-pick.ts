import { sql } from "drizzle-orm";
import { db } from "@/db";
import { SITE_URL } from "./site";
import {
  HOT_MIN_VOTERS,
  composeDailyText,
  dailyWindow,
  type DailyPick,
} from "./daily-pick-text";

// 毎日のX投稿で紹介する1テーマの選出。週次の投稿と同じく結果は保存せず、
// 投稿するそのときに選ぶ。最近紹介したテーマ(x-post-guard の目印)は除く
export * from "./daily-pick-text";

// revisit で候補にする累計上位の件数。この中からランダムに1つ選ぶ
const REVISIT_POOL = 30;

const iso = (d: Date) => d.toISOString();

// 除外リストを SQL の条件にする。空配列の `not in ()` は書けないため分岐する
function notIn(ids: string[]) {
  return ids.length > 0
    ? sql`and t.id not in (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})`
    : sql``;
}

type Row = { id: string; title: string; voters: number };

// new → hot → revisit の順に探し、最初に見つかったものを返す。
// どれも無い(テーマが1つも無い)ときだけ null
export async function selectDailyPick(now: Date, excludeIds: string[]): Promise<DailyPick | null> {
  const { from, to } = dailyWindow(now);
  const exclude = notIn(excludeIds);

  // 直近24時間に立ったテーマ。複数あれば投票の多いもの、同数なら新しいもの
  const fresh = await db.execute<Row>(sql`
    select t.id, t.title, count(distinct v.participant_id)::int as voters
    from themes t
    left join votes v on v.theme_id = t.id
    where t.status = 'active'
      and t.created_at >= ${iso(from)}::timestamptz and t.created_at < ${iso(to)}::timestamptz
      ${exclude}
    group by t.id, t.title, t.created_at
    order by voters desc, t.created_at desc
    limit 1
  `);
  if (fresh.rows[0]) return toPick("new", fresh.rows[0]);

  // 直近24時間に投票した人数が多かったテーマ
  const hot = await db.execute<Row>(sql`
    select t.id, t.title, count(distinct v.participant_id)::int as voters
    from votes v
    join themes t on t.id = v.theme_id and t.status = 'active'
    where v.created_at >= ${iso(from)}::timestamptz and v.created_at < ${iso(to)}::timestamptz
      ${exclude}
    group by t.id, t.title, t.created_at
    having count(distinct v.participant_id) >= ${HOT_MIN_VOTERS}
    order by voters desc, t.created_at desc
    limit 1
  `);
  if (hot.rows[0]) return toPick("hot", hot.rows[0]);

  // 累計で投票が多かったテーマから、最近紹介していないものをランダムに1つ
  const revisit = await db.execute<Row>(sql`
    select id, title, voters from (
      select t.id, t.title, count(distinct v.participant_id)::int as voters
      from themes t
      left join votes v on v.theme_id = t.id
      where t.status = 'active'
        ${exclude}
      group by t.id, t.title
      order by voters desc
      limit ${REVISIT_POOL}
    ) pool
    order by random()
    limit 1
  `);
  if (revisit.rows[0]) return toPick("revisit", revisit.rows[0]);

  return null;
}

function toPick(kind: DailyPick["kind"], row: Row): DailyPick {
  return { kind, id: row.id, title: row.title, voters: Number(row.voters) };
}

export function dailyPickUrl(id: string): string {
  return `${SITE_URL}/t/${id}`;
}

// 選出から投稿文までをまとめて作る。cronと管理画面で同じ処理を使う
export async function buildDailyPostText(
  now: Date,
  excludeIds: string[],
): Promise<{ pick: DailyPick; text: string } | null> {
  const pick = await selectDailyPick(now, excludeIds);
  if (!pick) return null;
  return { pick, text: composeDailyText(pick, dailyPickUrl(pick.id)) };
}
