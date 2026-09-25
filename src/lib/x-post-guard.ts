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

// 毎日の投稿の目印。週次と同じくベストエフォートで、同じ日(JST)の二度目を止める
const dailyKeyOf = (dateKey: string) => `daily:${dateKey}`;
// 最近紹介したテーマのID。同じテーマが続けて紹介されないよう、選出から除く
const RECENT_KEY = "recent-themes";
// 何日ぶんの紹介を覚えておくか
const RECENT_DAYS = 21;

type Recent = { id: string; at: number }[];

export async function wasPostedDaily(dateKey: string): Promise<boolean> {
  try {
    return (await getCache({ namespace: NAMESPACE }).get(dailyKeyOf(dateKey))) != null;
  } catch {
    return false;
  }
}

// 最近紹介したテーマのID(RECENT_DAYS 日以内)。読めなければ空として扱う
export async function recentlyFeatured(now: Date = new Date()): Promise<string[]> {
  try {
    const raw = (await getCache({ namespace: NAMESPACE }).get(RECENT_KEY)) as Recent | undefined;
    const since = now.getTime() - RECENT_DAYS * 24 * 60 * 60 * 1000;
    return Array.isArray(raw) ? raw.filter((r) => r.at >= since).map((r) => r.id) : [];
  } catch {
    return [];
  }
}

// 日次の投稿ができた日に印を付け、紹介したテーマを「最近紹介した」に足す
export async function markPostedDaily(
  dateKey: string,
  themeId: string,
  postId: string,
  now: Date = new Date(),
): Promise<void> {
  try {
    const cache = getCache({ namespace: NAMESPACE });
    await cache.set(dailyKeyOf(dateKey), postId, { ttl: TTL_SEC });
    const raw = (await cache.get(RECENT_KEY)) as Recent | undefined;
    const since = now.getTime() - RECENT_DAYS * 24 * 60 * 60 * 1000;
    const kept = (Array.isArray(raw) ? raw : []).filter((r) => r.at >= since && r.id !== themeId);
    await cache.set(RECENT_KEY, [...kept, { id: themeId, at: now.getTime() }], {
      ttl: RECENT_DAYS * 24 * 60 * 60,
    });
  } catch {
    // 印を残せなくても投稿自体は済んでいる
  }
}
