import { and, count, countDistinct, desc, eq, max, notInArray, sql } from "drizzle-orm";
import { cache } from "react";
import { db, themes, statements, votes, mathResults, themeTags } from "@/db";
import { TAG_VOCABULARY_LIMIT } from "../config";
import { withRuntimeCache } from "./shared";

// 単一テーマまわりの読み出し(本体・意見・投票・計算結果・タグ)をまとめる

// タグの語彙(使われている既存タグを使用数順に)。提案フォーム・タグ追加UIに
// 「一覧から選ぶ」候補として渡す。サジェスト(検索型)だと既存タグを見逃して
// 似た表記が乱立するため、一覧できる量に絞って最初から全部見せる方針
// /themes・/t/[id]・/new・/admin/tags の描画ごとに呼ばれる集計なので、
// 全員に同じ内容である点を活かして Runtime Cache で共有する(5分)。
// タグが増減したときは各アクションが "tag-vocab" を無効化する
const TAG_VOCAB_TTL_SEC = 300;

export async function getTagVocabulary(limit = TAG_VOCABULARY_LIMIT): Promise<string[]> {
  return withRuntimeCache("tags", `tag-vocab:${limit}`, TAG_VOCAB_TTL_SEC, ["tag-vocab"], async () => {
    const rows = await db
      .select({ tag: themeTags.tag, n: count() })
      .from(themeTags)
      .innerJoin(themes, and(eq(themes.id, themeTags.themeId), eq(themes.status, "active")))
      .groupBy(themeTags.tag)
      .orderBy(desc(count()), themeTags.tag)
      .limit(limit);
    return rows.map((r) => r.tag);
  });
}

// テーマのタグ一覧(テーマページ表示用)。idは通報の対象指定に使う
export async function getThemeTags(
  themeId: string,
): Promise<{ id: number; tag: string }[]> {
  return db
    .select({ id: themeTags.id, tag: themeTags.tag })
    .from(themeTags)
    .where(eq(themeTags.themeId, themeId))
    .orderBy(themeTags.id);
}

// 同一リクエスト内での重複呼び出し(ページ描画・generateMetadata等)を1回に統合する。
export const getTheme = cache(async (id: string) => {
  const [theme] = await db.select().from(themes).where(eq(themes.id, id));
  if (!theme || theme.status !== "active") return null;
  return theme;
});

export async function getVisibleStatements(themeId: string) {
  return db
    .select({ id: statements.id, text: statements.text, createdAt: statements.createdAt })
    .from(statements)
    .where(and(eq(statements.themeId, themeId), eq(statements.status, "visible")))
    .orderBy(statements.id);
}

// 参加者がまだ投票していない意見(投票デッキ用)。ランダム順で偏りを避ける
export async function getUnvotedStatements(themeId: string, participantId: string | null) {
  const voted = participantId
    ? db
        .select({ id: votes.statementId })
        .from(votes)
        .where(and(eq(votes.themeId, themeId), eq(votes.participantId, participantId)))
    : null;

  const conditions = [eq(statements.themeId, themeId), eq(statements.status, "visible")];
  const base = db
    .select({ id: statements.id, text: statements.text })
    .from(statements);

  const query = voted
    ? base.where(and(...conditions, notInArray(statements.id, voted)))
    : base.where(and(...conditions));

  return query.orderBy(sql`random()`).limit(100);
}

export async function getThemeCounts(themeId: string) {
  const [row] = await db
    .select({
      voterCount: countDistinct(votes.participantId),
      voteCount: count(votes.statementId),
      // 投票の追加・変更(訂正)を検知するための最終更新時刻
      lastVoteAt: max(votes.updatedAt),
    })
    .from(votes)
    .where(eq(votes.themeId, themeId));
  return row ?? { voterCount: 0, voteCount: 0, lastVoteAt: null };
}

// result には全参加者の座標とpidMapが入っていて、参加者が増えるほど肥大する。
// 中身を実際に使うページ(テーマ・レポート)だけがこれを呼ぶこと
export async function getMathResult(themeId: string) {
  const [row] = await db.select().from(mathResults).where(eq(mathResults.themeId, themeId));
  return row ?? null;
}

// 再計算の要否判定など、メタ情報しか要らないホットパス用。
// 大きな result を転送せずに済ませる
export async function getMathResultMeta(
  themeId: string,
): Promise<{ computedAt: Date; voteCount: number } | null> {
  const [row] = await db
    .select({ computedAt: mathResults.computedAt, voteCount: mathResults.voteCount })
    .from(mathResults)
    .where(eq(mathResults.themeId, themeId));
  return row ?? null;
}

// 自分の意見マップ上の位置(行列インデックス)だけをDB側で引く。
// pidMap は result の一部だが、必要なのは自分の1要素だけなので
// JSONB全体をアプリに転送しない(participantId は必ずバインド変数で渡す)
export async function getMyMapIndex(
  themeId: string,
  participantId: string,
): Promise<number | null> {
  const [row] = await db
    .select({
      idx: sql<number | null>`(${mathResults.result}->'pidMap'->>${participantId})::int`,
    })
    .from(mathResults)
    .where(eq(mathResults.themeId, themeId));
  return row?.idx ?? null;
}

// この参加者がこのテーマで既に投票した数(再訪時のマップ閾値カウント用)
export async function getMyVoteCount(themeId: string, participantId: string | null): Promise<number> {
  if (!participantId) return 0;
  const [row] = await db
    .select({ n: count() })
    .from(votes)
    .where(and(eq(votes.themeId, themeId), eq(votes.participantId, participantId)));
  return row?.n ?? 0;
}

// この参加者のこのテーマでの投票(意見ID→値)。投票の訂正UIで現在の投票を表示するのに使う
export async function getMyVotes(
  themeId: string,
  participantId: string | null,
): Promise<Record<number, number>> {
  if (!participantId) return {};
  const rows = await db
    .select({ statementId: votes.statementId, value: votes.value })
    .from(votes)
    .where(and(eq(votes.themeId, themeId), eq(votes.participantId, participantId)));
  const map: Record<number, number> = {};
  for (const r of rows) map[r.statementId] = r.value;
  return map;
}
