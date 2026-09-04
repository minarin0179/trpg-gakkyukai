import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  pickPrimaryRelatedTheme,
  type RelatedReason,
  type RelatedTheme,
} from "@/lib/related-theme";

// 「ほかのテーマ」の候補取り。テーマページ下部の欄と、投票を終えた画面の
// 「次のテーマ」の両方がここを使う。
//
// 以前は「タグの重なり → 直近7日の投票数 → 新しい順」の1本のランキングで3件出していたが、
// 重なりと人気が支配的で、どの枠も同じ傾向のテーマばかりになった(運営からの指摘)。
// そこで性質の違う3枠に分け、1枠ずつ別々に選ぶ。
//   related  : タグの重なりが最も多いテーマ(重なり0件なら枠ごと出さない)
//   trending : 直近7日の投票が最も多いテーマ
//   random   : 残りからの一様ランダム(埋もれたテーマにも順番が回るようにする)
//
// 除外: 現在のテーマ本人、先に決まった枠のテーマ、そして participantId が
// 渡された場合はその人が1票でも投じたテーマ(まず未参加のテーマを勧める)。
// cookieが無い訪問者は participantId が null になり、除外条件が成立しないだけ。
//
// 呼び出し回数は「ISRの再生成1回」または「デッキを1つ終えたとき1回」なので、
// 巨大な1本のSQLにまとめるより、枠ごとに小さなクエリを投げるほうが読みやすい。

export type { RelatedTheme, RelatedReason };

// 表示用の集計(投票者数・意見数)。選ばれた1件にだけ付ける
const countColumns = sql`
  (select count(distinct v.participant_id)::int from votes v where v.theme_id = t.id)
    as voter_count,
  (select count(*)::int from statements s
    where s.theme_id = t.id and s.status = 'visible') as statement_count
`;

// この参加者が既に投票したテーマを外す条件。participantId が null のときは
// 比較が常にNULL(=真にならない)ため、実質的に何も除外しない
const notVotedBy = (participantId: string | null): SQL => sql`
  not exists (
    select 1 from votes v
    where v.theme_id = t.id and v.participant_id = ${participantId}::text
  )
`;

// 既に決まった枠のテーマを外す条件。空のときは常に真の条件を返す
const notIn = (ids: string[]): SQL =>
  ids.length === 0
    ? sql`true`
    : sql`t.id not in (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})`;

type Row = { id: string; title: string; voter_count: number; statement_count: number };

const toTheme = (row: Row, reason: RelatedReason): RelatedTheme => ({
  id: row.id,
  title: row.title,
  voterCount: Number(row.voter_count),
  statementCount: Number(row.statement_count),
  reason,
});

// 1) 関連: 現在のテーマとタグが重なるテーマのうち、重なりが最も多いもの。
// 候補を「タグを共有するテーマ」に先に絞ることで、重なり0件は自然に対象外になる。
// 同数のときは直近7日の投票数が多い順 → 新しい順(静かなテーマ同士の決定的な決着)
async function pickRelated(
  currentThemeId: string,
  participantId: string | null,
  excluded: string[],
): Promise<RelatedTheme | null> {
  const { rows } = await db.execute<Row>(sql`
    with my_tags as (
      select tag from theme_tags where theme_id = ${currentThemeId}
    ),
    overlap as (
      select tt.theme_id, count(*)::int as n
      from theme_tags tt
      join my_tags mt on mt.tag = tt.tag
      where tt.theme_id <> ${currentThemeId}
      group by tt.theme_id
    ),
    recent as (
      select theme_id, count(*)::int as n
      from votes
      where created_at > now() - interval '7 days'
      group by theme_id
    )
    select t.id, t.title, ${countColumns}
    from overlap o
    join themes t on t.id = o.theme_id and t.status = 'active'
    left join recent r on r.theme_id = t.id
    where ${notIn([currentThemeId, ...excluded])} and ${notVotedBy(participantId)}
    order by o.n desc, coalesce(r.n, 0) desc, t.created_at desc
    limit 1
  `);
  return rows[0] ? toTheme(rows[0], "related") : null;
}

// 2) 注目: 直近7日の投票が最も多いテーマ。
// recent との内部結合なので、この期間に1票も入っていないテーマは候補に入らない
// (「いま動いている」と言えないものをこの枠に出さないため)
async function pickTrending(
  currentThemeId: string,
  participantId: string | null,
  excluded: string[],
): Promise<RelatedTheme | null> {
  const { rows } = await db.execute<Row>(sql`
    with recent as (
      select theme_id, count(*)::int as n
      from votes
      where created_at > now() - interval '7 days'
      group by theme_id
    )
    select t.id, t.title, ${countColumns}
    from recent r
    join themes t on t.id = r.theme_id and t.status = 'active'
    where ${notIn([currentThemeId, ...excluded])} and ${notVotedBy(participantId)}
    order by r.n desc, t.created_at desc
    limit 1
  `);
  return rows[0] ? toTheme(rows[0], "trending") : null;
}

// 3) おまかせ: 残りから一様ランダムに1件。
// order by random() は全行にソートキーを振るが、themes は数百行規模の小さな表で、
// 呼ばれるのもISRの再生成時とデッキ完了時だけなので、この単純さを優先する
async function pickRandom(
  currentThemeId: string,
  participantId: string | null,
  excluded: string[],
): Promise<RelatedTheme | null> {
  const { rows } = await db.execute<Row>(sql`
    select t.id, t.title, ${countColumns}
    from themes t
    where t.status = 'active'
      and ${notIn([currentThemeId, ...excluded])} and ${notVotedBy(participantId)}
    order by random()
    limit 1
  `);
  return rows[0] ? toTheme(rows[0], "random") : null;
}

// 3枠を順に埋める。埋まらなかった枠は詰めずに落とす(別の枠で穴埋めしない。
// 「関連が無いのに関連の顔をして出す」ことを避けるため)
export async function getRelatedThemes(
  currentThemeId: string,
  participantId: string | null,
): Promise<RelatedTheme[]> {
  const picked: RelatedTheme[] = [];
  const related = await pickRelated(currentThemeId, participantId, []);
  if (related) picked.push(related);

  const trending = await pickTrending(
    currentThemeId,
    participantId,
    picked.map((p) => p.id),
  );
  if (trending) picked.push(trending);

  const random = await pickRandom(
    currentThemeId,
    participantId,
    picked.map((p) => p.id),
  );
  if (random) picked.push(random);

  return picked;
}

// 投票を終えた画面に出す1件。3枠のうち先に埋まったものを優先順で返す
export async function getNextThemeSuggestion(
  currentThemeId: string,
  participantId: string | null,
): Promise<RelatedTheme | null> {
  return pickPrimaryRelatedTheme(await getRelatedThemes(currentThemeId, participantId));
}
