import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";
import { db, themes } from "@/db";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const active = await db
    .select({ id: themes.id, createdAt: themes.createdAt })
    .from(themes)
    .where(eq(themes.status, "active"));

  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/themes`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/new`, priority: 0.7 },
    { url: `${SITE_URL}/about`, priority: 0.5 },
    { url: `${SITE_URL}/terms`, priority: 0.2 },
    { url: `${SITE_URL}/privacy`, priority: 0.2 },
  ];

  return [
    ...staticPages,
    ...active.map((t) => ({
      url: `${SITE_URL}/t/${t.id}`,
      lastModified: t.createdAt,
      changeFrequency: "hourly" as const,
      priority: 0.8,
    })),
  ];
}
