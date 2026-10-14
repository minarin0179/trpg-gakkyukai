import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { db, themes } from "@/db";
import { SITE_URL } from "./site";
import { composeNewThemeText } from "./x-new-theme-text";
import { isXConfigured, postToX } from "./x-post";

// 新規テーマの X 自動投稿。テーマの提案直後に postNewThemeById で1件投稿する
// (createThemeAction の after から呼ぶ)。投稿済みの記録は themes.x_post_id(X 側の投稿ID)。
// 失敗した行は null のまま残り、日次の cron(/api/cron/new-themes)が古い順に拾って再試行する。
// 以前は10分ごとの cron で投稿していたが、Hobby プランの cron は1日1回までのため
// 投稿時の即時実行に切り替え、cron は取りこぼしの回収だけにした。
// 提案から ELIGIBLE_HOURS を過ぎたものは対象から外す(恒久的に失敗する行を叩き続けない)。
// 日次 cron の実行時刻は最大59分ずれるので、24時間だと回収前に対象から外れ得る。そのため48時間。
// 1回の cron で投稿するのは最大 MAX_PER_RUN 件。障害明けにまとめて溜まっていても
// フォロワーのタイムラインを埋めず、X API のレート制限にも当たりにくくする
export const MAX_PER_RUN = 5;
export const ELIGIBLE_HOURS = 48;
const PENDING = "pending";

export type NewThemeCandidate = { id: string; title: string; createdAt: Date };

export async function listUnpostedThemes(limit = MAX_PER_RUN): Promise<NewThemeCandidate[]> {
  const since = new Date(Date.now() - ELIGIBLE_HOURS * 60 * 60 * 1000);
  return db
    .select({ id: themes.id, title: themes.title, createdAt: themes.createdAt })
    .from(themes)
    .where(and(eq(themes.status, "active"), isNull(themes.xPostId), gt(themes.createdAt, since)))
    .orderBy(asc(themes.createdAt))
    .limit(limit);
}

export function themeUrl(id: string): string {
  return `${SITE_URL}/t/${id}`;
}

// 1件投稿する。先に x_post_id を "pending" にして行を確保し(未投稿の行だけが対象)、
// 投稿できたら X の投稿IDに置き換える。失敗したら null に戻して次回に回す。
// 確保できなかった(別の実行が先に取った)ときは何もしない
export async function postNewTheme(
  theme: NewThemeCandidate,
): Promise<{ id: string; postId: string } | null> {
  const claimed = await db
    .update(themes)
    .set({ xPostId: PENDING })
    .where(and(eq(themes.id, theme.id), isNull(themes.xPostId)))
    .returning({ id: themes.id });
  if (claimed.length === 0) return null;
  try {
    const { id: postId } = await postToX(composeNewThemeText(theme.title, themeUrl(theme.id)));
    await db.update(themes).set({ xPostId: postId }).where(eq(themes.id, theme.id));
    return { id: theme.id, postId };
  } catch (e) {
    await db
      .update(themes)
      .set({ xPostId: null })
      .where(and(eq(themes.id, theme.id), eq(themes.xPostId, PENDING)));
    throw e;
  }
}

// 以前の実行が途中で落ちて "pending" のまま残った行を解放する(30分以上経ったもの)。
// 投稿自体は済んでいる可能性があるので、解放後の再投稿は X の重複判定に任せる
export async function releaseStalePending(): Promise<number> {
  const rows = await db
    .update(themes)
    .set({ xPostId: null })
    .where(
      and(
        eq(themes.xPostId, PENDING),
        sql`${themes.createdAt} < now() - interval '30 minutes'`,
      ),
    )
    .returning({ id: themes.id });
  return rows.length;
}

// 提案直後の即時投稿。資格情報が無い環境(ローカル・プレビュー)では何もしない。
// 失敗しても例外は投げない(テーマの提案自体は成功しているため)。行は null に戻るので
// 日次 cron が再試行する。秘密は x-post.ts の中だけで扱うため、ログの文言には含まれない
export async function postNewThemeById(themeId: string): Promise<void> {
  if (!isXConfigured()) return;
  try {
    const [theme] = await db
      .select({ id: themes.id, title: themes.title, createdAt: themes.createdAt })
      .from(themes)
      .where(and(eq(themes.id, themeId), eq(themes.status, "active"), isNull(themes.xPostId)));
    if (!theme) return;
    const result = await postNewTheme(theme);
    console.log(`new-theme-x-post instant theme=${themeId} posted=${result ? result.postId : "skipped"}`);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.log(`new-theme-x-post instant failed theme=${themeId} error=${error}`);
  }
}
