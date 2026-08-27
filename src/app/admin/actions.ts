"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { db, themes, statements, reports } from "@/db";
import { recomputeTheme } from "@/lib/recompute";
import { isAdmin } from "@/lib/admin-auth";
import { notFound } from "next/navigation";

// 通報対象を削除(status=removed)して通報を消化する
export async function removeContentAction(formData: FormData) {
  if (!(await isAdmin())) notFound();
  const reportId = Number(formData.get("reportId"));
  const targetType = String(formData.get("targetType"));
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
      // 削除された意見を除いてマップを再計算
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

  // 通報は削除せず「対応済み(削除)」として残す
  await db
    .update(reports)
    .set({ resolvedAt: new Date(), resolution: "removed" })
    .where(eq(reports.id, reportId));
  redirect("/admin");
}

// 基準に該当しない通報を却下する(削除せず「対応済み(却下)」として残す)
export async function dismissReportAction(formData: FormData) {
  if (!(await isAdmin())) notFound();
  const reportId = Number(formData.get("reportId"));
  await db
    .update(reports)
    .set({ resolvedAt: new Date(), resolution: "dismissed" })
    .where(eq(reports.id, reportId));
  redirect("/admin");
}
