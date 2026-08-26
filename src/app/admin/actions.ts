"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { db, themes, statements, reports } from "@/db";
import { recomputeTheme } from "@/lib/recompute";

function verifyKey(key: unknown): asserts key is string {
  if (
    typeof key !== "string" ||
    !process.env.ADMIN_KEY ||
    key !== process.env.ADMIN_KEY
  ) {
    throw new Error("unauthorized");
  }
}

// 通報対象を削除(status=removed)して通報を消化する
export async function removeContentAction(formData: FormData) {
  const key = formData.get("key");
  verifyKey(key);
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

  await db.delete(reports).where(eq(reports.id, reportId));
  redirect(`/admin?key=${encodeURIComponent(key)}`);
}

// 基準に該当しない通報を却下する
export async function dismissReportAction(formData: FormData) {
  const key = formData.get("key");
  verifyKey(key);
  const reportId = Number(formData.get("reportId"));
  await db.delete(reports).where(eq(reports.id, reportId));
  redirect(`/admin?key=${encodeURIComponent(key)}`);
}
