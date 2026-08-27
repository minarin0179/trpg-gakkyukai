import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { timingSafeEqual, createHash } from "crypto";

export const ADMIN_COOKIE = "gk_admin";

// 一定時間で比較して鍵の推測(タイミング攻撃)を防ぐ
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// Cookieに入れる認証トークン(ADMIN_KEYそのものは入れず、ハッシュを入れる)
export function adminToken(): string {
  const key = process.env.ADMIN_KEY ?? "";
  return createHash("sha256").update(`admin:${key}`).digest("hex");
}

// Cookieのみで認証済みか判定する。
// ?key= を受け取ってCookieを立てる処理は middleware.ts が行う(Server Component
// のレンダリング中はCookieを書けないため)。
export async function isAdmin(): Promise<boolean> {
  if (!process.env.ADMIN_KEY) return false;
  const store = await cookies();
  const c = store.get(ADMIN_COOKIE)?.value;
  return !!c && safeEqual(c, adminToken());
}

// ページ用: 未認証なら notFound()(ページの存在自体を隠す)
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) notFound();
}
