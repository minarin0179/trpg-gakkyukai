import {
  formatWeekRange,
  isDigestBody,
  isoWeekKey,
  listDigestRows,
  weekStartFromKey,
} from "@/lib/digest";
import { SITE_URL } from "@/lib/site";

// 週に1回しか増えないので、ISRで1時間キャッシュする
// (再生成時は revalidateDigest がこのパスも無効化する)
export const revalidate = 3600;

// フィードに載せる件数(1年分)
const FEED_LIMIT = 52;

// XMLに埋め込む前のエスケープ。タイトルや下書き本文には「&」や引用符が入り得る
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const rows = await listDigestRows(FEED_LIMIT);

  const items = rows
    .map((row) => {
      const weekStart = weekStartFromKey(row.weekStart);
      const body = isDigestBody(row.body) ? row.body : null;
      const weekKey = body?.weekKey ?? isoWeekKey(weekStart);
      const range = body?.range ?? formatWeekRange(weekStart);
      const url = `${SITE_URL}/digest/${weekKey}`;
      return [
        "    <item>",
        `      <title>${escapeXml(`今週の学級会(${range})`)}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        `      <pubDate>${row.createdAt.toUTCString()}</pubDate>`,
        `      <description>${escapeXml(row.text)}</description>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "  <channel>",
    "    <title>TRPG学級会 週間ダイジェスト</title>",
    `    <link>${SITE_URL}/digest</link>`,
    "    <description>TRPG学級会の1週間のまとめ(投票が多かったテーマ・新しく見つかった合意・まだ人が少ないテーマ)</description>",
    "    <language>ja</language>",
    items,
    "  </channel>",
    "</rss>",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
