import { parseTagFilter } from "@/lib/queries";

// /themes/tag/[tag] のパラメータ(カンマ区切り、URL エンコード済み)をタグ配列にする。
// page.tsx は決まった名前以外を export できないので、2つのタグページで共有するここに置く
export function parseTagParam(raw: string): string[] {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // 壊れたパーセントエンコードはそのまま扱う(該当タグなしになるだけ)
  }
  return parseTagFilter(decoded.slice(0, 200));
}
