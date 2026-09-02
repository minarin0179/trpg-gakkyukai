import {
  and,
  countDistinct,
  desc,
  eq,
  inArray,
  max,
  notInArray,
  sql,
  type SQL,
} from "drizzle-orm";
import { getCache } from "@vercel/functions";
import { db, themes, statements, votes, mathResults, themeTags } from "@/db";
import { actorHash } from "../participant";
import {
  TAGS_PER_THEME,
  PROMOTION_MIN_PARTICIPANTS,
  THEMES_PAGE_SIZE,
} from "../config";
import { hotScore, withRuntimeCache } from "./shared";

// 実行時にも検証できるよう配列を正とし、型はそこから導出する
// (クライアント由来のtabをServer Actionの入口で照合するため)
export const THEME_TABS = ["fresh", "active", "mine", "unread", "proposed"] as const;
export type ThemesTab = (typeof THEME_TABS)[number];

export type ThemeWithCounts = {
  id: string;
  title: string;
  description: string;
  createdAt: Date;
  voterCount: number;
  statementCount: number;
  tags?: string[]; // テーマのタグ(全員共通)
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

  // 勢い(hotScore)の降順。減衰の式は shared.ts に一本化してある
  const main = rows
    .filter((r) => r.voterCount >= PROMOTION_MIN_PARTICIPANTS)
    .sort((a, b) => hotScore(b) - hotScore(a));
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
    return sql`(themes.title ILIKE ${like} OR themes.description ILIKE ${like}
      OR exists (select 1 from theme_tags tt where tt.theme_id = themes.id and tt.tag ILIKE ${like}))`;
  });
  return and(...conds);
}

// 検索: タイトル・説明の部分一致(正確なヒット)を先頭に、埋め込みの意味検索
// (表記が違っても内容が近いテーマ)を関連度順で後ろに補完するハイブリッド。
// ページングは結合済みID列に対して行い、順序を保って集計を付け直す
// 意味検索のID列は呼び出し側(search.ts)が用意して渡す。
// 埋め込み・レート制限は headers() を必要とするリクエスト依存の処理なので、
// クエリ層に持ち込まないための分担
async function listSearchPage(
  query: string,
  offset: number,
  limit: number,
  semanticIds: string[],
): Promise<ThemeWithCounts[]> {
  const cond = buildSearchCondition(query);
  const likeRows = cond
    ? await db
        .select({ id: themes.id })
        .from(themes)
        .where(and(eq(themes.status, "active"), cond))
        .orderBy(desc(themes.createdAt), desc(themes.id))
        .limit(100)
    : ([] as { id: string }[]);
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
// 一覧の付加情報(マップ有無・タグ)の共有部分
const THEMES_ENRICH_TTL_SEC = 60;

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
  return rows
    .filter((r) => r.voterCount >= PROMOTION_MIN_PARTICIPANTS)
    .sort((a, b) => hotScore(b) - hotScore(a))
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

  // マップの有無とタグは全員に同じ内容(=参加者に依存しない)なので、
  // 2本まとめて Runtime Cache に載せる。キーはテーマIDの並び順に依存しないよう
  // ソートして連結する(IDは12文字・1ページ20件なのでキーは十分短い)。
  // テーマの増減は "themes-list"、タグの変更は "tag-vocab" で無効化される。
  const shared = await withRuntimeCache(
    "themes",
    `themes-enrich:${ids.slice().sort().join(",")}`,
    THEMES_ENRICH_TTL_SEC,
    ["themes-list", "tag-vocab"],
    async (): Promise<{ mapReady: string[]; tags: Record<string, string[]> }> => {
      // マップの有無はテーマの公開情報なので、参加の有無に関係なく常に算出する。
      // 巨大な result JSON全体ではなく status フィールドだけを抽出する(転送量削減)。
      const maps = await db
        .select({
          themeId: mathResults.themeId,
          status: sql<string | null>`${mathResults.result} ->> 'status'`,
        })
        .from(mathResults)
        .where(inArray(mathResults.themeId, ids));

      // タグ(全員共通)。一覧カードのチップ表示用にまとめて引く
      const tagRows = await db
        .select({ themeId: themeTags.themeId, tag: themeTags.tag })
        .from(themeTags)
        .where(inArray(themeTags.themeId, ids))
        .orderBy(themeTags.id);
      const tags: Record<string, string[]> = {};
      for (const r of tagRows) (tags[r.themeId] ??= []).push(r.tag);

      return {
        mapReady: maps.filter((m) => m.status === "ok").map((m) => m.themeId),
        tags,
      };
    },
  );
  const mapReady = new Set(shared.mapReady);

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
    const tags = shared.tags[t.id] ?? [];
    // cookieが無い(未参加の匿名)訪問者は、識別子を新規発行せずに
    // 表示上「未参加」として扱う。1票入れれば cookie が発行され参加済みになる。
    if (!participantId) return { ...t, hasMap, tags, participated: false };
    const myAnswered = answeredMap.get(t.id) ?? 0;
    return {
      ...t,
      hasMap,
      tags,
      unansweredCount: Math.max(t.statementCount - myAnswered, 0),
      participated: myAnswered > 0,
    };
  });
}

// タグ絞り込みの指定文字列を解釈する。呼び出し側も「タグ絞り込み中かどうか」で
// 意味検索の要否を判断するため、同じ規則を共有できるよう公開する。
// タグはカンマ区切りで複数指定できる(タグ名にカンマは使えない)
export function parseTagFilter(tagFilter?: string): string[] {
  return (tagFilter ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, TAGS_PER_THEME);
}

// タブに応じてページを取得し、参加者ごとの付加情報を合成して返す。
export async function listThemesForTab(
  tab: ThemesTab,
  participantId: string | null,
  offset: number,
  limit: number = THEMES_PAGE_SIZE,
  query?: string,
  tagFilter?: string,
  tagMode: "and" | "or" = "or",
  // 検索時の意味検索ヒット(search.ts が算出)。無い場合は部分一致のみ
  semanticIds: string[] = [],
): Promise<ThemeWithCounts[]> {
  // タグ・検索語があればタブに関係なく全アクティブテーマから探す
  const tagList = parseTagFilter(tagFilter);
  const q = query?.trim();
  const raw = tagList.length
    ? await listByTagPage(tagList, tagMode, offset, limit)
    : q
    ? await listSearchPage(q, offset, limit, semanticIds)
    : tab === "mine"
      ? await listParticipatedPage(participantId, offset, limit)
      : tab === "unread"
        ? await listUnreadPage(participantId, offset, limit)
        : tab === "proposed"
          ? await listProposedPage(participantId, offset, limit)
          : await listThemesPage(tab, offset, limit);
  return enrichThemesForParticipant(raw, participantId);
}

// タグ絞り込み: 指定タグ群が付いたアクティブテーマを新着順。
// mode "or"=いずれかを含む / "and"=すべて含む(グループ集計で判定)
async function listByTagPage(
  tags: string[],
  mode: "and" | "or",
  offset: number,
  limit: number,
): Promise<ThemeWithCounts[]> {
  const base = db
    .select({ id: themeTags.themeId })
    .from(themeTags)
    .where(inArray(themeTags.tag, tags))
    .groupBy(themeTags.themeId);
  const tagged =
    mode === "and"
      ? base.having(sql`count(distinct ${themeTags.tag}) = ${tags.length}`)
      : base;
  return themesWithCountsQuery(inArray(themes.id, tagged))
    .orderBy(desc(themes.createdAt), desc(themes.id))
    .limit(limit)
    .offset(offset);
}

// 提案したタブ: 自分(cookie)が提案したテーマを新着順。
// proposerHashは提案時のcookie IDのハッシュなので、cookieが変わると辿れなくなる
// (アカウントレス設計の制約として許容)
export async function listProposedPage(
  participantId: string | null,
  offset: number,
  limit: number = THEMES_PAGE_SIZE,
): Promise<ThemeWithCounts[]> {
  if (!participantId) return [];
  return themesWithCountsQuery(eq(themes.proposerHash, actorHash(participantId)))
    .orderBy(desc(themes.createdAt), desc(themes.id))
    .limit(limit)
    .offset(offset);
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
