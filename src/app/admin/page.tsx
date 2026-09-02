import type { Metadata } from "next";
import Link from "next/link";
import { desc, inArray, isNull, isNotNull, count } from "drizzle-orm";
import { db, reports, statements, themes, themeTags } from "@/db";
import {
  removeContentAction,
  dismissTargetAction,
  dismissReportAction,
  adminLogoutAction,
} from "./actions";
import { REMOVAL_CRITERIA } from "@/lib/rules";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

type ReportRow = typeof reports.$inferSelect;

// 同じ対象への通報をまとめる。theme/statement は (targetType,targetId) で束ね、
// contact は対象IDを共有("-")するため束ねず1件ずつ独立したグループにする。
type Group = {
  key: string;
  targetType: string;
  targetId: string;
  reports: ReportRow[];
  latestAt: Date;
};

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  await requireAdmin();

  const { tab } = await searchParams;
  const resolvedView = tab === "resolved";

  const [rows, [openCountRow], [resolvedCountRow]] = await Promise.all([
    db
      .select()
      .from(reports)
      .where(resolvedView ? isNotNull(reports.resolvedAt) : isNull(reports.resolvedAt))
      .orderBy(desc(resolvedView ? reports.resolvedAt : reports.createdAt))
      .limit(300),
    db.select({ n: count() }).from(reports).where(isNull(reports.resolvedAt)),
    db.select({ n: count() }).from(reports).where(isNotNull(reports.resolvedAt)),
  ]);
  const openCount = openCountRow?.n ?? 0;
  const resolvedCount = resolvedCountRow?.n ?? 0;

  // 対象ごとにグループ化(rowsは新しい順なので、初出順=表示順が保たれる)
  const groupMap = new Map<string, Group>();
  for (const r of rows) {
    const key = r.targetType === "contact" ? `contact:${r.id}` : `${r.targetType}:${r.targetId}`;
    const sortAt = (resolvedView ? r.resolvedAt : r.createdAt) ?? r.createdAt;
    const g = groupMap.get(key);
    if (g) {
      g.reports.push(r);
      if (sortAt > g.latestAt) g.latestAt = sortAt;
    } else {
      groupMap.set(key, {
        key,
        targetType: r.targetType,
        targetId: r.targetId,
        reports: [r],
        latestAt: sortAt,
      });
    }
  }
  const groups = [...groupMap.values()];

  // 通報対象の本文を引き当てる
  const stmtIds = groups
    .filter((g) => g.targetType === "statement")
    .map((g) => Number(g.targetId));
  const stmts = stmtIds.length
    ? await db.select().from(statements).where(inArray(statements.id, stmtIds))
    : [];
  const stmtMap = new Map(stmts.map((s) => [String(s.id), s]));

  // タグ通報の対象引き当て(削除済みならmapに載らず「対象が見つかりません」になる)
  const tagIds = groups
    .filter((g) => g.targetType === "tag")
    .map((g) => Number(g.targetId))
    .filter((n) => Number.isFinite(n));
  const tagRows = tagIds.length
    ? await db
        .select({ id: themeTags.id, tag: themeTags.tag, themeId: themeTags.themeId })
        .from(themeTags)
        .where(inArray(themeTags.id, tagIds))
    : [];
  const tagMap = new Map(tagRows.map((t) => [String(t.id), t]));

  // テーマタイトルは「通報されたテーマ」と「通報された意見が属するテーマ」の両方が必要
  const themeIdSet = new Set<string>();
  for (const g of groups) if (g.targetType === "theme") themeIdSet.add(g.targetId);
  for (const s of stmts) themeIdSet.add(s.themeId);
  for (const t of tagRows) themeIdSet.add(t.themeId);
  const themeIds = [...themeIdSet];
  const themeRows = themeIds.length
    ? await db.select().from(themes).where(inArray(themes.id, themeIds))
    : [];
  const themeMap = new Map(themeRows.map((t) => [t.id, t]));

  const tabClass = (active: boolean) =>
    `px-4 py-2 text-sm font-medium ${active ? "border-b-2 border-stone-900" : "text-stone-600"}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-bold">通報管理</h1>
        <form action={adminLogoutAction}>
          <button type="submit" className="text-xs underline">
            ログアウト
          </button>
        </form>
      </div>

      <div className="flex gap-1 border-b border-stone-400">
        <Link href="/admin" className={tabClass(!resolvedView)}>
          未対応（{openCount}）
        </Link>
        <Link href="/admin?tab=resolved" className={tabClass(resolvedView)}>
          対応済み（{resolvedCount}）
        </Link>
      </div>

      {groups.length === 0 && (
        <p className="rounded-lg border border-dashed border-stone-400 p-6 text-center text-sm text-stone-600">
          {resolvedView ? "対応済みの通報はありません。" : "未対応の通報はありません。"}
        </p>
      )}

      {groups.map((g) => {
        const isContact = g.targetType === "contact";
        const isStatement = g.targetType === "statement";
        const isTag = g.targetType === "tag";
        const stmt = isStatement ? stmtMap.get(g.targetId) : null;
        const tagRow = isTag ? tagMap.get(g.targetId) : null;
        const theme = g.targetType === "theme" ? themeMap.get(g.targetId) : null;
        // 意見・タグが属するテーマ(コンテキスト表示用)
        const parentTheme = stmt
          ? themeMap.get(stmt.themeId)
          : tagRow
            ? themeMap.get(tagRow.themeId)
            : null;

        const targetText = isStatement
          ? (stmt?.text ?? "(対象が見つかりません)")
          : isTag
            ? (tagRow ? `タグ「${tagRow.tag}」` : "(対象が見つかりません・削除済みの可能性)")
            : isContact
              ? ""
              : (theme?.title ?? "(対象が見つかりません)");
        const targetStatus = stmt?.status ?? theme?.status ?? null;
        const themeTitle = isStatement || isTag ? parentTheme?.title : theme?.title;
        const themeLink = isStatement
          ? stmt?.themeId
          : isTag
            ? tagRow?.themeId
            : g.targetType === "theme"
              ? g.targetId
              : null;

        return (
          <div key={g.key} className="rounded-lg border border-stone-400 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs text-stone-600">
                {isContact
                  ? "お問い合わせ"
                  : `対象: ${isStatement ? "意見" : isTag ? "タグ" : "テーマ"}`}
                {targetStatus && (
                  <>
                    {" · 現在の状態: "}
                    <span className={targetStatus === "removed" ? "font-medium text-rose-700" : ""}>
                      {targetStatus === "removed" ? "削除済み" : targetStatus}
                    </span>
                  </>
                )}
              </p>
              <span className="shrink-0 rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                通報 {g.reports.length}件
              </span>
            </div>

            {/* テーマタイトル(コンテキスト) */}
            {!isContact && (
              <p className="mt-2 text-xs text-stone-600">
                テーマ:{" "}
                {themeLink ? (
                  <Link href={`/t/${themeLink}`} className="underline">
                    {themeTitle ?? "(不明)"}
                  </Link>
                ) : (
                  (themeTitle ?? "(不明)")
                )}
              </p>
            )}

            {/* 通報対象の本文 */}
            {!isContact && <p className="mt-1 text-sm font-medium">「{targetText}」</p>}

            {/* 通報理由のアコーディオン(contactは1件なのでそのまま表示) */}
            {isContact ? (
              <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">{g.reports[0].reason}</p>
            ) : (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-medium text-stone-700">
                  通報理由を見る（{g.reports.length}件）
                </summary>
                <ul className="mt-2 flex flex-col gap-2 border-l-2 border-stone-200 pl-3">
                  {g.reports.map((r) => (
                    <li key={r.id} className="text-sm">
                      <span className="text-xs text-stone-500">
                        {r.createdAt.toLocaleString("ja-JP")}
                        {resolvedView && r.resolution && (
                          <>
                            {" · "}
                            {r.resolution === "removed" ? "削除" : "却下"}
                          </>
                        )}
                      </span>
                      <p className="whitespace-pre-wrap text-stone-700">{r.reason}</p>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {/* アクション */}
            {resolvedView ? (
              <p className="mt-3 text-xs font-medium text-stone-600">
                {(() => {
                  const res = g.reports[0].resolution;
                  const label =
                    res === "removed" ? "対応: 対象を削除" : res === "dismissed" ? "対応: 却下(基準外)" : "対応済み";
                  return `${label} · ${g.latestAt.toLocaleString("ja-JP")}`;
                })()}
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {!isContact && (
                  <form action={removeContentAction} className="flex items-center gap-2">
                    <input type="hidden" name="targetType" value={g.targetType} />
                    <input type="hidden" name="targetId" value={g.targetId} />
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
                      {isTag ? "タグを削除" : "対象を削除"}
                    </button>
                  </form>
                )}
                {isContact ? (
                  <form action={dismissReportAction}>
                    <input type="hidden" name="reportId" value={g.reports[0].id} />
                    <button
                      type="submit"
                      className="rounded-md border border-stone-400 px-3 py-1 text-xs font-medium text-stone-700"
                    >
                      対応済みにする
                    </button>
                  </form>
                ) : (
                  <form action={dismissTargetAction}>
                    <input type="hidden" name="targetType" value={g.targetType} />
                    <input type="hidden" name="targetId" value={g.targetId} />
                    <button
                      type="submit"
                      className="rounded-md border border-stone-400 px-3 py-1 text-xs font-medium text-stone-700"
                    >
                      通報を却下(基準外)
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
