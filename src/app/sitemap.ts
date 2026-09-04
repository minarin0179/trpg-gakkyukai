import type { MetadataRoute } from "next";
import { desc, eq } from "drizzle-orm";
import { db, themes, digests } from "@/db";
import { SITE_URL } from "@/lib/site";
import { isDigestBody, isoWeekKey, weekStartFromKey } from "@/lib/digest";

// 1時間ごとの再生成。テーマ一覧の反映が最大1時間遅れても実害はなく、
// クローラの取得ごとに関数実行しない
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [active, digestRows] = await Promise.all([
    db
      .select({ id: themes.id, createdAt: themes.createdAt })
      .from(themes)
      .where(eq(themes.status, "active")),
    // 週間ダイジェストは1年分だけ載せる(古い週は一覧からたどれる)。
    // マイグレーション(digestsテーブルの作成)を当てる前でもサイトマップ自体は
    // 生成できるよう、失敗しても空扱いにする(ビルド時にも評価されるため)
    db
      .select({ weekStart: digests.weekStart, body: digests.body, createdAt: digests.createdAt })
      .from(digests)
      .orderBy(desc(digests.weekStart))
      .limit(52)
      .catch((e) => {
        console.error("sitemap: failed to list digests:", e);
        return [];
      }),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/themes`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/digest`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/new`, priority: 0.7 },
    { url: `${SITE_URL}/about`, priority: 0.5 },
    { url: `${SITE_URL}/terms`, priority: 0.2 },
    { url: `${SITE_URL}/privacy`, priority: 0.2 },
  ];

  const digestPages: MetadataRoute.Sitemap = digestRows.map((row) => {
    const body = isDigestBody(row.body) ? row.body : null;
    const weekKey = body?.weekKey ?? isoWeekKey(weekStartFromKey(row.weekStart));
    return {
      url: `${SITE_URL}/digest/${weekKey}`,
      lastModified: row.createdAt,
      changeFrequency: "yearly" as const,
      priority: 0.4,
    };
  });

  return [
    ...staticPages,
    ...digestPages,
    ...active.map((t) => ({
      url: `${SITE_URL}/t/${t.id}`,
      lastModified: t.createdAt,
      changeFrequency: "hourly" as const,
      priority: 0.8,
    })),
  ];
}
