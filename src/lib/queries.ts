import { and, countDistinct, desc, eq, count, inArray, max, notInArray, sql } from "drizzle-orm";
import { db, themes, statements, votes, mathResults } from "@/db";
import { PROMOTION_MIN_PARTICIPANTS, RANKING_GRAVITY, THEMES_PAGE_SIZE } from "./config";

export type ThemeWithCounts = {
  id: string;
  title: string;
  description: string;
  createdAt: Date;
  voterCount: number;
  statementCount: number;
};

export async function listThemes(): Promise<{
  main: ThemeWithCounts[];
  fresh: ThemeWithCounts[];
}> {
  const rows = await db
    .select({
      id: themes.id,
      title: themes.title,
      description: themes.description,
      createdAt: themes.createdAt,
      voterCount: countDistinct(votes.participantId),
      statementCount: countDistinct(statements.id),
    })
    .from(themes)
    .leftJoin(votes, eq(votes.themeId, themes.id))
    .leftJoin(
      statements,
      and(eq(statements.themeId, themes.id), eq(statements.status, "visible")),
    )
    .where(eq(themes.status, "active"))
    .groupBy(themes.id)
    .orderBy(desc(themes.createdAt))
    .limit(200);

  // Hacker News方式: 参加者数を経過時間で減衰させ、古いテーマを自然に沈める
  const score = (r: (typeof rows)[number]) => {
    const ageDays = (Date.now() - r.createdAt.getTime()) / 86_400_000;
    return r.voterCount / Math.pow(ageDays + 2, RANKING_GRAVITY);
  };
  const main = rows
    .filter((r) => r.voterCount >= PROMOTION_MIN_PARTICIPANTS)
    .sort((a, b) => score(b) - score(a));
  const fresh = rows.filter((r) => r.voterCount < PROMOTION_MIN_PARTICIPANTS);
  return { main, fresh };
}

// テーマ一覧(無限スクロール)用のページ取得。
// 集計列(投票者数・意見数)を含む共通の select を組み立てる。
function themesWithCountsQuery() {
  return db
    .select({
      id: themes.id,
      title: themes.title,
      description: themes.description,
      createdAt: themes.createdAt,
      voterCount: countDistinct(votes.participantId),
      statementCount: countDistinct(statements.id),
    })
    .from(themes)
    .leftJoin(votes, eq(votes.themeId, themes.id))
    .leftJoin(
      statements,
      and(eq(statements.themeId, themes.id), eq(statements.status, "visible")),
    )
    .where(eq(themes.status, "active"))
    .groupBy(themes.id);
}

// 新着タブ: 全アクティブテーマを新着順。DBのoffset/limitでそのままページング
async function listFreshPage(offset: number, limit: number): Promise<ThemeWithCounts[]> {
  return themesWithCountsQuery()
    .orderBy(desc(themes.createdAt), desc(themes.id))
    .limit(limit)
    .offset(offset);
}

// 議論中タブ: 10票以上を勢い順(スコアはJS計算のため、全件取得してsort→slice)。
// 議論中は母集団が小さいため全件取得のコストは小さい。
async function listActivePage(offset: number, limit: number): Promise<ThemeWithCounts[]> {
  const rows = await themesWithCountsQuery().limit(1000);
  const score = (r: (typeof rows)[number]) => {
    const ageDays = (Date.now() - r.createdAt.getTime()) / 86_400_000;
    return r.voterCount / Math.pow(ageDays + 2, RANKING_GRAVITY);
  };
  return rows
    .filter((r) => r.voterCount >= PROMOTION_MIN_PARTICIPANTS)
    .sort((a, b) => score(b) - score(a))
    .slice(offset, offset + limit);
}

export async function listThemesPage(
  tab: "fresh" | "active",
  offset: number,
  limit: number = THEMES_PAGE_SIZE,
): Promise<ThemeWithCounts[]> {
  return tab === "active" ? listActivePage(offset, limit) : listFreshPage(offset, limit);
}

// 参加済みタブ: 自分(participantId)が投票したアクティブなテーマを、
// 最後に投票した日時が新しい順(最近さわった順)で返す。
export async function listParticipatedPage(
  participantId: string | null,
  offset: number,
  limit: number = THEMES_PAGE_SIZE,
): Promise<ThemeWithCounts[]> {
  if (!participantId) return [];
  // 1) 自分が投票したテーマを最終投票日時の降順でページング
  const mine = await db
    .select({
      id: themes.id,
      title: themes.title,
      description: themes.description,
      createdAt: themes.createdAt,
      lastVotedAt: max(votes.createdAt),
    })
    .from(votes)
    .innerJoin(themes, and(eq(themes.id, votes.themeId), eq(themes.status, "active")))
    .where(eq(votes.participantId, participantId))
    .groupBy(themes.id)
    .orderBy(desc(max(votes.createdAt)))
    .limit(limit)
    .offset(offset);
  if (mine.length === 0) return [];
  // 2) 表示用の集計(投票者数・意見数)をまとめて取得し、1)の順序を保って合成
  const ids = mine.map((m) => m.id);
  const counts = await db
    .select({
      id: themes.id,
      voterCount: countDistinct(votes.participantId),
      statementCount: countDistinct(statements.id),
    })
    .from(themes)
    .leftJoin(votes, eq(votes.themeId, themes.id))
    .leftJoin(
      statements,
      and(eq(statements.themeId, themes.id), eq(statements.status, "visible")),
    )
    .where(inArray(themes.id, ids))
    .groupBy(themes.id);
  const countMap = new Map(counts.map((c) => [c.id, c]));
  return mine.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    createdAt: m.createdAt,
    voterCount: countMap.get(m.id)?.voterCount ?? 0,
    statementCount: countMap.get(m.id)?.statementCount ?? 0,
  }));
}

export async function getTheme(id: string) {
  const [theme] = await db.select().from(themes).where(eq(themes.id, id));
  if (!theme || theme.status !== "active") return null;
  return theme;
}

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

export async function getMathResult(themeId: string) {
  const [row] = await db.select().from(mathResults).where(eq(mathResults.themeId, themeId));
  return row ?? null;
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
