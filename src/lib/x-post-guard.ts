import { getCache } from "@vercel/functions";
import { weekStartKey } from "./digest-text";

// 週次のX投稿を二重に出さないための目印。投稿の記録はDBに持たない方針なので、
// Runtime Cache(リージョンごと・ベストエフォート)に週の印だけを残す。
// 同じ週の投稿を14日以内にもう一度走らせたとき、キャッシュが覚えていればスキップする
// 「だけ」の仕組みで、二重投稿しないことの保証ではない
// (キャッシュが使えない環境・別リージョン・期限切れでは印が見つからない)。
const NAMESPACE = "x-post";
const TTL_SEC = 14 * 24 * 60 * 60;

const keyOf = (weekStart: Date) => `weekly:${weekStartKey(weekStart)}`;

// 投稿できた週に印を付ける。付けられなくても投稿自体は済んでいるので、
// 失敗は握りつぶす(次の実行で重複し得る、という程度の影響)
export async function markPosted(weekStart: Date, postId: string): Promise<void> {
  try {
    await getCache({ namespace: NAMESPACE }).set(keyOf(weekStart), postId, { ttl: TTL_SEC });
  } catch {
    // Runtime Cacheが使えない環境(ローカル開発など)では印を残さない
  }
}

// その週の印があるか。読めなければ「無い」として扱い、投稿を止めない
export async function wasPosted(weekStart: Date): Promise<boolean> {
  try {
    return (await getCache({ namespace: NAMESPACE }).get(keyOf(weekStart))) != null;
  } catch {
    return false;
  }
}
