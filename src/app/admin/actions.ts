"use server";

import { redirect } from "next/navigation";
import { revalidateTheme } from "@/lib/revalidate";
import { and, eq, isNull, sql } from "drizzle-orm";
import { after } from "next/server";
import { getCache } from "@vercel/functions";
import { db, themes, statements, reports, themeTags } from "@/db";
import { normalizeTag } from "@/lib/tags";
import { TAGS_PER_THEME } from "@/lib/config";
import { recomputeTheme } from "@/lib/recompute";
import { isAdmin, loginAdmin, logoutAdmin } from "@/lib/admin-auth";
import { checkAndRecordRate } from "@/lib/rate-limit";
import { ipActor } from "@/lib/request";
import { notFound } from "next/navigation";
import { isTargetType, toIntId } from "@/lib/validate";
import {
  generateAndStoreDigest,
  getDigestRow,
  postDigestToX,
  startOfWeekJst,
  weekStartFromKey,
} from "@/lib/digest";
import { isXConfigured } from "@/lib/x-post";
import type { ActionResult } from "@/lib/action-result";

type TargetType = "theme" | "statement" | "contact" | "tag";

// 同じ対象(theme/statement)への未対応の通報をまとめて解決する。
// これにより、対象を消した後に他の通報が未対応のまま残る問題を防ぐ。
async function resolveOpenReportsForTarget(
  targetType: TargetType,
  targetId: string,
  resolution: "removed" | "dismissed",
) {
  await db
    .update(reports)
    .set({ resolvedAt: new Date(), resolution })
    .where(
      and(
        eq(reports.targetType, targetType),
        eq(reports.targetId, targetId),
        isNull(reports.resolvedAt),
      ),
    );
}

// 通報対象を削除(status=removed)し、その対象への未対応通報を全て消化する
export async function removeContentAction(formData: FormData) {
  if (!(await isAdmin())) notFound();
  // フォーム値は型注釈では保証されない。不正値でDB例外を起こす前にここで弾く
  const targetType = formData.get("targetType");
  if (!isTargetType(targetType)) notFound();
  const targetId = String(formData.get("targetId"));
  const reason = String(formData.get("removedReason") ?? "通報対応");

  if (targetType === "statement") {
    const sid = toIntId(targetId);
    if (sid === null) notFound();
    const [stmt] = await db
      .select({ themeId: statements.themeId })
      .from(statements)
      .where(eq(statements.id, sid));
    await db
      .update(statements)
      .set({ status: "removed", removedReason: reason })
      .where(eq(statements.id, sid));
    if (stmt) {
      // 削除はISRの30分キャッシュを待たず即時にページへ反映する(notice & takedownの実効性)
      revalidateTheme(stmt.themeId);
      after(async () => {
        await recomputeTheme(stmt.themeId).catch(() => {});
      });
    }
  } else if (targetType === "tag") {
    const tid = toIntId(targetId);
    if (tid === null) notFound();
    const [row] = await db
      .select({ themeId: themeTags.themeId })
      .from(themeTags)
      .where(eq(themeTags.id, tid));
    await db.delete(themeTags).where(eq(themeTags.id, tid));
    // タグ語彙・一覧カードのタグのRuntime Cacheからも即時に消す
    await getCache()
      .expireTag("tag-vocab")
      .catch(() => {});
    if (row) revalidateTheme(row.themeId);
  } else if (targetType === "theme") {
    await db
      .update(themes)
      .set({ status: "removed", removedReason: reason })
      .where(eq(themes.id, targetId));
    revalidateTheme(targetId);
    // テーマ一覧のRuntime Cacheからも即時に消す。
    // タグ語彙はactiveテーマのみを数えるため、テーマの削除でも変わる
    await getCache()
      .expireTag("themes-list")
      .catch(() => {});
    await getCache()
      .expireTag("tag-vocab")
      .catch(() => {});
  }

  // 同じ対象への未対応の通報をまとめて「対応済み(削除)」に
  await resolveOpenReportsForTarget(targetType, targetId, "removed");
  redirect("/admin");
}

// 対象(theme/statement)への未対応通報をまとめて却下する(基準外)
export async function dismissTargetAction(formData: FormData) {
  if (!(await isAdmin())) notFound();
  const targetType = formData.get("targetType");
  if (!isTargetType(targetType)) notFound();
  const targetId = String(formData.get("targetId"));
  await resolveOpenReportsForTarget(targetType, targetId, "dismissed");
  redirect("/admin");
}

// 単一の通報を対応済みにする(主にお問い合わせ用。contactは対象でまとめない)
export async function dismissReportAction(formData: FormData) {
  if (!(await isAdmin())) notFound();
  const reportId = toIntId(formData.get("reportId"));
  if (reportId === null) notFound();
  await db
    .update(reports)
    .set({ resolvedAt: new Date(), resolution: "dismissed" })
    .where(eq(reports.id, reportId));
  redirect("/admin");
}

// 管理ツール(/admin/tags)用: タグの付け外し。レート制限なし・認証必須。
// 一般ユーザー向けの addThemeTagAction と違い削除もできる
export async function adminSetTagAction(
  themeId: string,
  rawTag: string,
  op: "add" | "remove",
): Promise<ActionResult> {
  if (!(await isAdmin())) notFound();
  const { tag, error } = normalizeTag(rawTag);
  // normalizeTagはtagが無いとき必ず理由を返すが、型上はundefinedを取り得る
  if (!tag) return { ok: false, error: error ?? "操作に失敗しました" };

  if (op === "remove") {
    await db
      .delete(themeTags)
      .where(and(eq(themeTags.themeId, themeId), eq(themeTags.tag, tag)));
  } else {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(themeTags)
      .where(eq(themeTags.themeId, themeId));
    if (n >= TAGS_PER_THEME) return { ok: false, error: `タグは${TAGS_PER_THEME}個までです` };
    await db.insert(themeTags).values({ themeId, tag }).onConflictDoNothing();
  }
  // 付け外しのどちらでもタグ語彙・一覧カードのタグが変わる
  await getCache()
    .expireTag("tag-vocab")
    .catch(() => {});
  revalidateTheme(themeId);
  return { ok: true, data: undefined };
}

// フォームからの管理ログイン。鍵の総当たりを防ぐためIP単位で回数を絞る。
// 結果はクエリ文字列で返す(このページは他の管理画面と同じく素のformで組む)
export async function adminLoginAction(formData: FormData) {
  const key = String(formData.get("key") ?? "");
  const rate = await checkAndRecordRate("admin_login", await ipActor());
  if (!rate.ok) redirect("/admin/login?error=rate");
  if (!(await loginAdmin(key))) redirect("/admin/login?error=1");
  redirect("/admin");
}

export async function adminLogoutAction() {
  await logoutAdmin();
  redirect("/admin/login");
}

// 週間ダイジェストの主キー('YYYY-MM-DD' = JSTの月曜)
const WEEK_START_RE = /^\d{4}-\d{2}-\d{2}$/;

// ダイジェストの再生成。cronと同じ generateAndStoreDigest を使う
// (集計の定義が管理画面と自動実行で食い違わないようにするため)。
// weekStart の指定が無ければ、進行中の今週を作り直す
export async function regenerateDigestAction(formData: FormData) {
  if (!(await isAdmin())) notFound();
  const raw = String(formData.get("weekStart") ?? "");
  const weekStart = WEEK_START_RE.test(raw) ? weekStartFromKey(raw) : startOfWeekJst(new Date());
  await generateAndStoreDigest(weekStart);
  redirect("/admin");
}

// 下書きをXへ投稿する。二重投稿を避けるため、投稿済みの週には何もしない。
// 失敗の理由は postDigestToX がDBに記録し、管理画面に表示される
export async function postDigestAction(formData: FormData) {
  if (!(await isAdmin())) notFound();
  if (!isXConfigured()) notFound();
  const raw = String(formData.get("weekStart") ?? "");
  if (!WEEK_START_RE.test(raw)) notFound();
  const row = await getDigestRow(raw);
  if (!row) notFound();
  if (!row.postedAt) await postDigestToX(row);
  redirect("/admin");
}
