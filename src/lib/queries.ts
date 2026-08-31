import {
  and,
  cosineDistance,
  countDistinct,
  desc,
  eq,
  count,
  inArray,
  isNotNull,
  max,
  notInArray,
  sql,
  type SQL,
} from "drizzle-orm";
import { cache } from "react";
import { headers } from "next/headers";
import { getCache } from "@vercel/functions";
import { db, themes, statements, votes, mathResults } from "@/db";
import { embedTexts } from "./embedding";
import { checkAndRecordRate } from "./rate-limit";
import { dailyActorHash } from "./participant";
import {
  PROMOTION_MIN_PARTICIPANTS,
  RANKING_GRAVITY,
  THEMES_PAGE_SIZE,
  SEARCH_SIMILAR_THRESHOLD,
  SEARCH_SEMANTIC_MAX,
} from "./config";

export type ThemesTab = "fresh" | "active" | "mine" | "unread";

export type ThemeWithCounts = {
  id: string;
  title: string;
  description: string;
  createdAt: Date;
  voterCount: number;
  statementCount: number;
  // 以下は参加者(cookie)ごとに算出する任意の付加情報
  unansweredCount?: number; // 自分がまだ投票していない意見の数
  participated?: boolean; // 自分がこのテーマで1件以上投票したか
  hasMap?: boolean; // 意見マップ(status ok)が生成済みか
};

// テーマ一覧の集計は、votesとstatementsを同時にJOINすると「投票数×意見数」の
// 直積で中間結果が爆発し Neon が out of memory になる。各カウントを独立した
// 相関サブクエリで取ることで直積を避ける(::int で JS の number にする)。
// ${themes.id} 等はDrizzleがテーブル修飾なしで出力し、statements.id(整数)と
// 衝突して型エラーになるため、サブクエリ内はエイリアス付きの生SQLで明示的に書く
// (外側の themes は .from(themes) でエイリアスなしのため themes.id で参照できる)。
const voterCountSubquery = sql<number>`(
  select count(distinct v.participant_id)::int
  from votes v where v.theme_id = themes.id
)`;
const visibleStatementCountSubquery = sql<number>`(
  select count(*)::int from statements s
  where s.theme_id = themes.id and s.status = 'visible'
)`;

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
      voterCount: voterCountSubquery,
      statementCount: visibleStatementCountSubquery,
    })
    .from(themes)
    .where(eq(themes.status, "active"))
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
function themesWithCountsQuery(extra?: SQL) {
  return db
    .select({
      id: themes.id,
      title: themes.title,
      description: themes.description,
      createdAt: themes.createdAt,
      voterCount: voterCountSubquery,
      statementCount: visibleStatementCountSubquery,
    })
    .from(themes)
    .where(extra ? and(eq(themes.status, "active"), extra) : eq(themes.status, "active"));
}

// テーマ検索(タブ非依存)。空白区切りの各語について title/description の
// 部分一致(ILIKE)を AND で取る。表記ゆれ・略語は拾わない単純一致だが、
// この規模では十分軽く、検索ボックスとしては挙動が直感的。
// ユーザー入力中の LIKE ワイルドカード(% _ \)は literal 化してから渡す。
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function buildSearchCondition(query: string): SQL | undefined {
  const terms = query.split(/\s+/).filter(Boolean).slice(0, 6);
  if (terms.length === 0) return undefined;
  const conds = terms.map((t) => {
    const like = `%${escapeLike(t)}%`;
    return sql`(themes.title ILIKE ${like} OR themes.description ILIKE ${like})`;
  });
  return and(...conds);
}

// 意味検索: 検索語を埋め込み、類似度が閾値以上のテーマIDを関連度順で返す。
// 埋め込み不可・レート超過・失敗時は空配列(部分一致のみに縮退し、検索は止めない)
async function searchSemanticThemeIds(query: string): Promise<string[]> {
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rate = await checkAndRecordRate("search_embed", dailyActorHash(`ip:${ip}`));
    if (!rate.ok) return [];
    const vec = (await embedTexts([query]))?.[0];
    if (!vec) return [];
    const sim = sql<number>`1 - (${cosineDistance(themes.embedding, vec)})`;
    const near = await db
      .select({ id: themes.id, sim })
      .from(themes)
      .where(and(eq(themes.status, "active"), isNotNull(themes.embedding)))
      .orderBy(desc(sim))
      .limit(SEARCH_SEMANTIC_MAX);
    return near.filter((r) => Number(r.sim) >= SEARCH_SIMILAR_THRESHOLD).map((r) => r.id);
  } catch (e) {
    console.error("semantic search failed:", e);
    return [];
  }
}

// 検索: タイトル・説明の部分一致(正確なヒット)を先頭に、埋め込みの意味検索
// (表記が違っても内容が近いテーマ)を関連度順で後ろに補完するハイブリッド。
// ページングは結合済みID列に対して行い、順序を保って集計を付け直す
async function listSearchPage(
  query: string,
  offset: number,
  limit: number,
): Promise<ThemeWithCounts[]> {
  const cond = buildSearchCondition(query);
  const [likeRows, semanticIds] = await Promise.all([
    cond
      ? db
          .select({ id: themes.id })
          .from(themes)
          .where(and(eq(themes.status, "active"), cond))
          .orderBy(desc(themes.createdAt), desc(themes.id))
          .limit(100)
      : Promise.resolve([] as { id: string }[]),
    searchSemanticThemeIds(query),
  ]);
  const seen = new Set(likeRows.map((r) => r.id));
  const ids = [...likeRows.map((r) => r.id), ...semanticIds.filter((id) => !seen.has(id))];
  const pageIds = ids.slice(offset, offset + limit);
  if (pageIds.length === 0) return [];
  const rows = await themesWithCountsQuery(inArray(themes.id, pageIds));
  const order = new Map(pageIds.map((id, i) => [id, i]));
  return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

// テーマ一覧の共有部分(全員に同じ内容)を Runtime Cache で60秒共有する。
// 一覧ページは検索・タブがあり関数実行自体は避けられないが、重い集計クエリの
// 結果を共有することでDB読み出し(Neon転送)とCPUを削減する。
// 個人化(未参加フィルタ等)と検索(ヒット率が低い)はキャッシュしない。
// JSON化で Date が文字列になるため、取り出し時に復元する。
const THEMES_LIST_TTL_SEC = 60;

async function withThemesListCache(
  key: string,
  fetcher: () => Promise<ThemeWithCounts[]>,
): Promise<ThemeWithCounts[]> {
  let listCache: ReturnType<typeof getCache> | null = null;
  try {
    listCache = getCache({ namespace: "themes" });
    const hit = (await listCache.get(key)) as
      | (Omit<ThemeWithCounts, "createdAt"> & { createdAt: string })[]
      | null
      | undefined;
    if (hit) return hit.map((r) => ({ ...r, createdAt: new Date(r.createdAt) }));
  } catch {
    // ローカル開発などRuntime Cacheが使えない環境ではキャッシュなしで続行
    listCache = null;
  }
  const rows = await fetcher();
  if (listCache) {
    await listCache
      .set(key, rows, { ttl: THEMES_LIST_TTL_SEC, tags: ["themes-list"] })
      .catch(() => {});
  }
  return rows;
}

// 新着タブ: 全アクティブテーマを新着順。DBのoffset/limitでそのままページング
async function listFreshPage(offset: number, limit: number): Promise<ThemeWithCounts[]> {
  return withThemesListCache(`fresh:${offset}:${limit}`, () =>
    themesWithCountsQuery()
      .orderBy(desc(themes.createdAt), desc(themes.id))
      .limit(limit)
      .offset(offset),
  );
}

// 人気タブ: 10票以上を勢い順(スコアはJS計算のため、全件取得してsort→slice)。
// 人気は母集団が小さいため全件取得のコストは小さい。
async function listActivePage(offset: number, limit: number): Promise<ThemeWithCounts[]> {
  const rows = await withThemesListCache("active:base", () =>
    themesWithCountsQuery().limit(1000),
  );
  const score = (r: (typeof rows)[number]) => {
    const ageDays = (Date.now() - r.createdAt.getTime()) / 86_400_000;
    return r.voterCount / Math.pow(ageDays + 2, RANKING_GRAVITY);
  };
  return rows
    .filter((r) => r.voterCount >= PROMOTION_MIN_PARTICIPANTS)
    .sort((a, b) => score(b) - score(a))
    .slice(offset, offset + limit);
}

// 未参加タブ: 自分がまだ一度も投票していないテーマを新着順(=参加済みの逆)。
// participantIdなしの場合は全テーマが未参加なので新着と同じ。
async function listUnreadPage(
  participantId: string | null,
  offset: number,
  limit: number,
): Promise<ThemeWithCounts[]> {
  if (!participantId) return listFreshPage(offset, limit);
  const myVotedThemes = db
    .select({ id: votes.themeId })
    .from(votes)
    .where(eq(votes.participantId, participantId));
  return themesWithCountsQuery(notInArray(themes.id, myVotedThemes))
    .orderBy(desc(themes.createdAt), desc(themes.id))
    .limit(limit)
    .offset(offset);
}

// 一覧のテーマに、参加者(cookie)ごとの付加情報を合成する。
// - unansweredCount: 自分がまだ投票していない可視の意見数
// - participated: 自分が1件以上投票したか
// - hasMap: 意見マップ(status ok)が生成済みか
// 匿名(participantIdなし)や空配列のときは追加クエリを打たずそのまま返す。
async function enrichThemesForParticipant(
  list: ThemeWithCounts[],
  participantId: string | null,
): Promise<ThemeWithCounts[]> {
  if (list.length === 0) return list;
  const ids = list.map((t) => t.id);

  // マップの有無はテーマの公開情報なので、参加の有無に関係なく常に算出する。
  // 巨大な result JSON全体ではなく status フィールドだけを抽出する(転送量削減)。
  const maps = await db
    .select({
      themeId: mathResults.themeId,
      status: sql<string | null>`${mathResults.result} ->> 'status'`,
    })
    .from(mathResults)
    .where(inArray(mathResults.themeId, ids));
  const mapReady = new Set(maps.filter((m) => m.status === "ok").map((m) => m.themeId));

  // 参加者依存の情報(未回答数・参加有無)は cookie があるときだけ算出する
  const answeredMap = new Map<string, number>();
  if (participantId) {
    const answered = await db
      .select({ themeId: statements.themeId, n: countDistinct(votes.statementId) })
      .from(statements)
      .innerJoin(
        votes,
        and(eq(votes.statementId, statements.id), eq(votes.participantId, participantId)),
      )
      .where(and(inArray(statements.themeId, ids), eq(statements.status, "visible")))
      .groupBy(statements.themeId);
    for (const a of answered) answeredMap.set(a.themeId, a.n);
  }

  return list.map((t) => {
    const hasMap = mapReady.has(t.id);
    // cookieが無い(未参加の匿名)訪問者は、識別子を新規発行せずに
    // 表示上「未参加」として扱う。1票入れれば cookie が発行され参加済みになる。
    if (!participantId) return { ...t, hasMap, participated: false };
    const myAnswered = answeredMap.get(t.id) ?? 0;
    return {
      ...t,
      hasMap,
      unansweredCount: Math.max(t.statementCount - myAnswered, 0),
      participated: myAnswered > 0,
    };
  });
}

// タブに応じてページを取得し、参加者ごとの付加情報を合成して返す。
export async function listThemesForTab(
  tab: ThemesTab,
  participantId: string | null,
  offset: number,
  limit: number = THEMES_PAGE_SIZE,
  query?: string,
): Promise<ThemeWithCounts[]> {
  // 検索語があればタブに関係なく全アクティブテーマから部分一致で探す
  const q = query?.trim();
  const raw = q
    ? await listSearchPage(q, offset, limit)
    : tab === "mine"
      ? await listParticipatedPage(participantId, offset, limit)
      : tab === "unread"
        ? await listUnreadPage(participantId, offset, limit)
        : await listThemesPage(tab, offset, limit);
  return enrichThemesForParticipant(raw, participantId);
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
      voterCount: voterCountSubquery,
      statementCount: visibleStatementCountSubquery,
    })
    .from(themes)
    .where(inArray(themes.id, ids));
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
