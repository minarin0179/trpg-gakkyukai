import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { db, reports, statements, themes } from "@/db";
import { removeContentAction, dismissReportAction } from "./actions";
import { REMOVAL_CRITERIA } from "@/lib/rules";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminPage() {
  await requireAdmin();

  const rows = await db.select().from(reports).orderBy(desc(reports.createdAt)).limit(100);

  // 通報対象の本文を引き当てる
  const stmtIds = rows.filter((r) => r.targetType === "statement").map((r) => Number(r.targetId));
  const themeIds = rows.filter((r) => r.targetType === "theme").map((r) => r.targetId);
  const stmts = stmtIds.length
    ? await db.select().from(statements).where(inArray(statements.id, stmtIds))
    : [];
  const reportedThemes = themeIds.length
    ? await db.select().from(themes).where(inArray(themes.id, themeIds))
    : [];
  const stmtMap = new Map(stmts.map((s) => [String(s.id), s]));
  const themeMap = new Map(reportedThemes.map((t) => [t.id, t]));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">通報管理({rows.length}件)</h1>
      {rows.length === 0 && (
        <p className="rounded-lg border border-dashed border-stone-400 p-6 text-center text-sm text-stone-600">
          未対応の通報はありません。
        </p>
      )}
      {rows.map((r) => {
        const isContact = r.targetType === "contact";
        const stmt = r.targetType === "statement" ? stmtMap.get(r.targetId) : null;
        const theme = r.targetType === "theme" ? themeMap.get(r.targetId) : null;
        const targetText =
          r.targetType === "statement"
            ? (stmt?.text ?? "(対象が見つかりません)")
            : (theme?.title ?? "(対象が見つかりません)");
        const targetStatus = stmt?.status ?? theme?.status ?? "?";
        const themeLink = isContact ? null : r.targetType === "statement" ? stmt?.themeId : r.targetId;
        return (
          <div key={r.id} className="rounded-lg border border-stone-400 bg-white p-4">
            <p className="text-xs text-stone-600">
              {r.createdAt.toLocaleString("ja-JP")} ·{" "}
              {isContact ? "お問い合わせ" : `対象: ${r.targetType === "statement" ? "意見" : "テーマ"} · 現在の状態: ${targetStatus}`}
              {themeLink && (
                <>
                  {" · "}
                  <Link href={`/t/${themeLink}`} className="underline">
                    テーマを開く
                  </Link>
                </>
              )}
            </p>
            {!isContact && <p className="mt-2 text-sm font-medium">「{targetText}」</p>}
            <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">
              {isContact ? r.reason : `通報理由: ${r.reason}`}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!isContact && (
              <form action={removeContentAction} className="flex items-center gap-2">
                <input type="hidden" name="reportId" value={r.id} />
                <input type="hidden" name="targetType" value={r.targetType} />
                <input type="hidden" name="targetId" value={r.targetId} />
                <select
                  name="removedReason"
                  className="rounded-md border border-stone-400 bg-white px-2 py-1 text-xs"
                  defaultValue={REMOVAL_CRITERIA[0].label}
                >
                  {REMOVAL_CRITERIA.map((c) => (
                    <option key={c.label} value={c.label}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={targetStatus === "removed"}
                  className="rounded-md bg-rose-700 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
                >
                  対象を削除
                </button>
              </form>
              )}
              <form action={dismissReportAction}>
                <input type="hidden" name="reportId" value={r.id} />
                <button
                  type="submit"
                  className="rounded-md border border-stone-400 px-3 py-1 text-xs font-medium text-stone-700"
                >
                  {isContact ? "対応済みにする" : "通報を却下(基準外)"}
                </button>
              </form>
            </div>
          </div>
        );
      })}
    </div>
  );
}
