import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// 接続先は Supabase の Transaction pooler(Supavisor、ポート6543)。
// transaction モードではセッションをまたいで prepared statement を共有できないため prepare:false が必須。
// Fluid compute は1インスタンスで複数リクエストを並行処理するので、少数の接続を使い回す。
// 開発時のホットリロードで接続が増え続けないよう、クライアントは globalThis に1つだけ持つ
const globalForDb = globalThis as unknown as { pgClient?: ReturnType<typeof postgres> };
const client =
  globalForDb.pgClient ??
  postgres(process.env.DATABASE_URL!, { prepare: false, max: 5, idle_timeout: 20 });
if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle(client, { schema });

// drizzle は日時型(timestamptz など)の変換を素通しにする。テーブルの列を通す値は drizzle が
// 文字列にしてから渡すが、生の SQL(sql`... ${date}`)に埋め込んだ Date はそのまま送られて
// postgres.js が例外を投げる。日時型の送信時だけ Date を ISO 文字列に直す
// (Neon の HTTP ドライバーでは Date をそのまま渡せていたため、移行で表に出た差)
for (const oid of [1082, 1083, 1114, 1184]) {
  const passthrough = client.options.serializers[oid];
  client.options.serializers[oid] = (v: unknown) =>
    v instanceof Date ? v.toISOString() : passthrough(v);
}
export * from "./schema";
