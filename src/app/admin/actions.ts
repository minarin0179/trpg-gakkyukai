"use server";

import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { after } from "next/server";
import { db, themes, statements, reports } from "@/db";
import { recomputeTheme } from "@/lib/recompute";
import { isAdmin } from "@/lib/admin-auth";
import { notFound } from "next/navigation";

type TargetType = "theme" | "statement" | "contact";

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
  const targetType = String(formData.get("targetType")) as TargetType;
  const targetId = String(formData.get("targetId"));
  const reason = String(formData.get("removedReason") ?? "通報対応");

  if (targetType === "statement") {
    const sid = Number(targetId);
    const [stmt] = await db
      .select({ themeId: statements.themeId })
      .from(statements)
      .where(eq(statements.id, sid));
    await db
      .update(statements)
      .set({ status: "removed", removedReason: reason })
      .where(eq(statements.id, sid));
    if (stmt) {
      after(async () => {
        await recomputeTheme(stmt.themeId).catch(() => {});
      });
    }
  } else if (targetType === "theme") {
    await db
      .update(themes)
      .set({ status: "removed", removedReason: reason })
      .where(eq(themes.id, targetId));
  }

  // 同じ対象への未対応の通報をまとめて「対応済み(削除)」に
  await resolveOpenReportsForTarget(targetType, targetId, "removed");
  redirect("/admin");
}

// 対象(theme/statement)への未対応通報をまとめて却下する(基準外)
export async function dismissTargetAction(formData: FormData) {
  if (!(await isAdmin())) notFound();
  const targetType = String(formData.get("targetType")) as TargetType;
  const targetId = String(formData.get("targetId"));
  await resolveOpenReportsForTarget(targetType, targetId, "dismissed");
  redirect("/admin");
}

// 単一の通報を対応済みにする(主にお問い合わせ用。contactは対象でまとめない)
export async function dismissReportAction(formData: FormData) {
  if (!(await isAdmin())) notFound();
  const reportId = Number(formData.get("reportId"));
  await db
    .update(reports)
    .set({ resolvedAt: new Date(), resolution: "dismissed" })
    .where(eq(reports.id, reportId));
  redirect("/admin");
}
