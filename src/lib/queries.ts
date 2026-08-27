import { and, countDistinct, desc, eq, count, notInArray, sql } from "drizzle-orm";
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
    })
    .from(votes)
    .where(eq(votes.themeId, themeId));
  return row ?? { voterCount: 0, voteCount: 0 };
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
