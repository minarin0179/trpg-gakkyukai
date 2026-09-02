// Server Action / Route Handler の入口で使う型・形式の検証。
// FK違反などのDB例外をerror.tsxに落とさず、フォームのエラーとして返すため。

// テーマIDは nanoid(12)
export const THEME_ID_RE = /^[A-Za-z0-9_-]{12}$/;

export function isThemeId(v: unknown): v is string {
  return typeof v === "string" && THEME_ID_RE.test(v);
}

// 意見ID・タグIDはPostgresのidentity整数。数値でも数値文字列でも受ける
export function toIntId(v: unknown): number | null {
  if (typeof v === "number") {
    return Number.isSafeInteger(v) && v > 0 ? v : null;
  }
  if (typeof v === "string" && /^[0-9]+$/.test(v)) {
    const n = Number(v);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  }
  return null;
}

// 通報の対象IDの長さ上限(テーマIDは12文字・整数IDはそれ以下)
export const REPORT_TARGET_ID_MAX = 64;

export function isTargetType(v: unknown): v is "theme" | "statement" | "contact" | "tag" {
  return v === "theme" || v === "statement" || v === "contact" || v === "tag";
}
