// 開発用: アクティブなテーマのタイトル一覧をJSONで書き出す(読み取りのみ)。
// 使い方: node --env-file=.env.local scripts/dump-theme-titles.mjs <出力先.json>
import { neon } from "@neondatabase/serverless";
import { writeFileSync } from "node:fs";

const out = process.argv[2];
if (!out) {
  console.error("usage: node scripts/dump-theme-titles.mjs <out.json>");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`SELECT id, title FROM themes WHERE status = 'active' ORDER BY created_at`;
writeFileSync(out, JSON.stringify(rows, null, 1));
console.log(`wrote ${rows.length} themes to ${out}`);
