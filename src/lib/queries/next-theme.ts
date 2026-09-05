import { sql } from "drizzle-orm";
import { db } from "@/db";

// 「ほかのテーマ」(テーマページ下部)と「次のテーマ」(投票完了時)の候補。
// 選び方はランダム。タグの近さや人気で選ぶ案も試したが、同系統のテーマに偏りやすく、
// 選出理由を見せる意味も薄かったため、既存の「ランダムに開く」と同じ考え方に揃えた。
// 除外: 現在のテーマ、参加者(cookie)が既に投票したテーマ(participantId が null なら除外なし)。
// テーブルは数百行なので order by random() で十分。表示用の件数は選ばれた行にだけ付ける

export type OtherTheme = {
  id: string;
  title: string;
  voterCount: number;
  statementCount: number;
};

export async function getRandomOtherThemes(
  currentThemeId: string,
  participantId: string | null,
  limit: number,
): Promise<OtherTheme[]> {
  const { rows } = await db.execute<{
    id: string;
    title: string;
    voter_count: number;
    statement_count: number;
  }>(sql`
    with picked as (
      select t.id, t.title
      from themes t
      where t.status = 'active'
        and t.id <> ${currentThemeId}
        and not exists (
          select 1 from votes v
          where v.theme_id = t.id and v.participant_id = ${participantId}::text
        )
      order by random()
      limit ${limit}
    )
    select p.id, p.title,
      (select count(distinct v.participant_id)::int from votes v where v.theme_id = p.id)
        as voter_count,
      (select count(*)::int from statements s
        where s.theme_id = p.id and s.status = 'visible') as statement_count
    from picked p
  `);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    voterCount: Number(r.voter_count),
    statementCount: Number(r.statement_count),
  }));
}

// 投票を終えた人向け: 未参加のテーマからランダムに1件
export async function getNextThemeSuggestion(
  currentThemeId: string,
  participantId: string | null,
): Promise<OtherTheme | null> {
  const [first] = await getRandomOtherThemes(currentThemeId, participantId, 1);
  return first ?? null;
}
