import { getCache } from "@vercel/functions";
import { RANKING_GRAVITY } from "../config";

// 一覧系のモジュールが共有する小さな道具。テーマ一覧(themes-list)と
// 単票まわり(theme)の両方から使うものだけを置く

// Hacker News方式: 参加者数を経過時間で減衰させ、古いテーマを自然に沈める。
// 「新着順の一覧」と「人気タブ」で同じ式を使うため、ここに一本化する
export function hotScore(r: { voterCount: number; createdAt: Date }): number {
  const ageDays = (Date.now() - r.createdAt.getTime()) / 86_400_000;
  return r.voterCount / Math.pow(ageDays + 2, RANKING_GRAVITY);
}

// Runtime Cache の汎用ラッパー(JSONとして往復できる値だけを載せる)。
// リージョンごと・ベストエフォートなので、ミスや失敗は常に起こり得る前提で
// 「キャッシュが無くても同じ結果になる」形に保つこと(値の復元処理を挟まない)。
export async function withRuntimeCache<T>(
  namespace: string,
  key: string,
  ttl: number,
  tags: string[],
  fetcher: () => Promise<T>,
): Promise<T> {
  let store: ReturnType<typeof getCache> | null = null;
  try {
    store = getCache({ namespace });
    const hit = (await store.get(key)) as T | null | undefined;
    if (hit != null) return hit;
  } catch {
    // ローカル開発などRuntime Cacheが使えない環境ではキャッシュなしで続行
    store = null;
  }
  const value = await fetcher();
  if (store) await store.set(key, value, { ttl, tags }).catch(() => {});
  return value;
}
