import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { timingSafeEqual, createHash } from "crypto";
import { adminKey } from "./env";
import {
  ADMIN_COOKIE,
  ADMIN_TOKEN_MAX_AGE_MS,
  issueAdminToken,
  verifyAdminToken,
} from "./admin-token";

// 一定時間で比較して鍵の推測(タイミング攻撃)を防ぐ
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// Cookieのみで認証済みか判定する。トークンには発行時刻が入っており、
// 期限切れ(および旧形式のCookie)はここで落ちて再ログインになる
export async function isAdmin(): Promise<boolean> {
  const key = adminKey();
  if (!key) return false;
  const store = await cookies();
  const c = store.get(ADMIN_COOKIE)?.value;
  return !!c && (await verifyAdminToken(key, c, ADMIN_TOKEN_MAX_AGE_MS));
}

// Cookieの属性。発行(ログイン)と破棄(ログアウト)で必ず揃える必要がある
// (pathが違うとブラウザは別のCookieとして扱い、削除できない)
const COOKIE_ATTRS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/admin",
} as const;

// フォームからのログイン。鍵が合っていれば期限付きトークンのCookieを立てる。
// Cookieを書けるのは Server Action / Route Handler だけなので、そこから呼ぶ
export async function loginAdmin(key: string): Promise<boolean> {
  const configured = adminKey();
  if (!configured || !safeEqual(key, configured)) return false;
  const store = await cookies();
  store.set(ADMIN_COOKIE, await issueAdminToken(configured), {
    ...COOKIE_ATTRS,
    maxAge: ADMIN_TOKEN_MAX_AGE_MS / 1000,
  });
  return true;
}

export async function logoutAdmin(): Promise<void> {
  const store = await cookies();
  store.delete({ name: ADMIN_COOKIE, ...COOKIE_ATTRS });
}

// ページ用: 未認証なら notFound()(ページの存在自体を隠す)
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) notFound();
}
