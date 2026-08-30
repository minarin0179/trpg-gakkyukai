// 既存テーマのタイトル埋め込みを一括生成して保存する(embedding が null の行のみ)。
// 事前に pgvector 拡張の有効化と db:push(embedding列の追加)が必要。
//
// 使い方(ローカル計算サーバー経由):
//   uv run python scripts/compute-server.py  # 別ターミナル
//   EMBED_URL=http://localhost:8787/embed node --env-file=.env.local scripts/backfill-embeddings.mjs
// 本番の /api/embed を使う場合は EMBED_URL を省略(CRON_SECRETで認証):
//   node --env-file=.env.local scripts/backfill-embeddings.mjs https://trpg-gakkyukai.com/api/embed
import { neon } from "@neondatabase/serverless";

const endpoint = process.env.EMBED_URL ?? process.argv[2];
if (!endpoint) {
  console.error("usage: EMBED_URL=... node scripts/backfill-embeddings.mjs [embed-endpoint]");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);
const BATCH = 50;

const rows = await sql`SELECT id, title FROM themes WHERE embedding IS NULL AND status = 'active'`;
console.log(`themes to backfill: ${rows.length}`);

for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Key": process.env.CRON_SECRET ?? "",
    },
    body: JSON.stringify({ texts: batch.map((r) => r.title) }),
  });
  if (!res.ok) throw new Error(`embed failed: ${res.status} ${await res.text()}`);
  const { vectors } = await res.json();
  for (let j = 0; j < batch.length; j++) {
    await sql`UPDATE themes SET embedding = ${JSON.stringify(vectors[j])}::vector WHERE id = ${batch[j].id}`;
  }
  console.log(`  ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
}
console.log("done");
