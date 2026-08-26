// 開発用シードデータ。2陣営に分かれる投票パターンを持つテーマを1つ作る。
// 使い方: node --env-file=.env.local scripts/seed.mjs
import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";

const sql = neon(process.env.DATABASE_URL);

const themeId = "seed" + Math.random().toString(36).slice(2, 10);
await sql`INSERT INTO themes (id, title, description, proposer_hash)
  VALUES (${themeId}, 'GMのダイス目改竄(いわゆる神の見えざる手)は許容される?',
  'セッションを盛り上げるためのGMの出目操作について。システムや卓の文化によって意見が分かれがちな論点です。', 'seed')`;

const stmts = [
  "物語を盛り上げるためなら出目操作も演出のうちだ",
  "どんな理由でもダイスの結果は絶対に尊重すべきだ",
  "PCが死ぬかどうかの場面に限れば操作してもよい",
  "出目操作をするならスクリーンの内側で、絶対に明かすべきではない",
  "セッション0で卓の方針として合意しておくべき問題だ",
  "操作が発覚したら信頼関係は壊れると思う",
  "システムのデザイン(致死性)に問題があるなら操作ではなくルールを変えるべきだ",
  "GMも一人のプレイヤーなのだから楽しみ方は自由だ",
];
const stmtIds = [];
for (const text of stmts) {
  const [row] = await sql`INSERT INTO statements (theme_id, text) VALUES (${themeId}, ${text}) RETURNING id`;
  stmtIds.push(row.id);
}

// 12人の参加者: 偶数=演出容認派, 奇数=出目尊重派。意見4(セッション0合意)は全員賛成
let rng = 12345;
const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
for (let p = 0; p < 12; p++) {
  const pid = randomUUID();
  await sql`INSERT INTO participants (id) VALUES (${pid})`;
  const camp = p % 2;
  for (let s = 0; s < stmtIds.length; s++) {
    let v;
    if (s === 4) v = 1; // 全員が合意する意見
    else if (s % 2 === camp) v = rand() > 0.15 ? 1 : -1;
    else v = rand() > 0.15 ? -1 : 0;
    await sql`INSERT INTO votes (statement_id, participant_id, theme_id, value)
      VALUES (${stmtIds[s]}, ${pid}, ${themeId}, ${v})`;
  }
}

console.log(`seeded theme: ${themeId} (${stmts.length} statements, 12 participants)`);
