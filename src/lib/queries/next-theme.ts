import { sql } from "drizzle-orm";
import { db } from "@/db";

// 投票を終えた人に出す「次のテーマ」の選定。
// 目的は離脱の防止なので、次に開いてすぐ投票できるテーマ(=まだ参加していない、
// 関心が近い、人が動いている)を1件だけ出す。

export type NextThemeSuggestion = {
  id: string;
  title: string;
  voterCount: number;
  statementCount: number;
};

// 並び順の根拠:
// 1) タグの重なり(overlap)が多い順 — 今読んだテーマと関心が近いものを最優先にする。
//    タグは誰でも付けられる公開の分類で、テーマ間の「近さ」として唯一手元にある情報。
// 2) 直近7日の投票数 — 人が動いているテーマは意見も票も戻ってきやすく、
//    投票しても反応が無い「過疎テーマ」に送って落胆させない。
// 3) 新しい順 — 1も2も無い(タグ無し・静かなテーマ同士の)場合の決定的なタイブレーク。
// 除外: 現在のテーマ本人と、この参加者が1票でも投じたテーマ
// (未投票の意見だけ残っているテーマに送ってもよいが、まず未参加を優先する)。
// cookieが無い訪問者は除外条件が常に成立しないので、全テーマが候補になる。
//
// コスト: 候補の並べ替えを内側のサブクエリに閉じ込め、表示用の集計(投票者数・意見数)は
// 選ばれた1件にだけ相関サブクエリで付ける。参加者の投票有無は
// votes_participant_theme_idx が効く。
export async function getNextThemeSuggestion(
  currentThemeId: string,
  participantId: string | null,
): Promise<NextThemeSuggestion | null> {
  const { rows } = await db.execute<{
    id: string;
    title: string;
    voter_count: number;
    statement_count: number;
  }>(sql`
    with my_tags as (
      select tag from theme_tags where theme_id = ${currentThemeId}
    ),
    recent as (
      select theme_id, count(*)::int as n
      from votes
      where created_at > now() - interval '7 days'
      group by theme_id
    ),
    picked as (
      select t.id, t.title
      from themes t
      left join recent r on r.theme_id = t.id
      where t.status = 'active'
        and t.id <> ${currentThemeId}
        and not exists (
          select 1 from votes v
          where v.theme_id = t.id and v.participant_id = ${participantId}::text
        )
      order by
        (select count(*)::int from theme_tags tt
           join my_tags mt on mt.tag = tt.tag
          where tt.theme_id = t.id) desc,
        coalesce(r.n, 0) desc,
        t.created_at desc
      limit 1
    )
    select p.id, p.title,
      (select count(distinct v.participant_id)::int from votes v where v.theme_id = p.id)
        as voter_count,
      (select count(*)::int from statements s
        where s.theme_id = p.id and s.status = 'visible') as statement_count
    from picked p
  `);

  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    voterCount: Number(row.voter_count),
    statementCount: Number(row.statement_count),
  };
}
