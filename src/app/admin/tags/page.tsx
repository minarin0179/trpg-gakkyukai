import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, themes, themeTags } from "@/db";
import { getTagVocabulary } from "@/lib/queries";
import { requireAdmin } from "@/lib/admin-auth";
import { AdminTagManager } from "@/components/AdminTagManager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

// タグの一括整理ツール(運営用)。全テーマのタグをその場で付け外しできる
export default async function AdminTagsPage() {
  await requireAdmin();

  const [rows, tagRows, vocabulary] = await Promise.all([
    db
      .select({ id: themes.id, title: themes.title })
      .from(themes)
      .where(eq(themes.status, "active"))
      .orderBy(desc(themes.createdAt)),
    db.select({ themeId: themeTags.themeId, tag: themeTags.tag }).from(themeTags).orderBy(themeTags.id),
    getTagVocabulary(),
  ]);

  const tagMap = new Map<string, string[]>();
  for (const t of tagRows) {
    if (!tagMap.has(t.themeId)) tagMap.set(t.themeId, []);
    tagMap.get(t.themeId)!.push(t.tag);
  }
  const items = rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">タグ整理</h1>
        <Link href="/admin" className="text-xs underline">
          通報管理へ
        </Link>
      </div>
      <AdminTagManager initialItems={items} vocabulary={vocabulary} />
    </div>
  );
}
