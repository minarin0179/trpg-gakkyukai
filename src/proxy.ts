import { NextRequest, NextResponse } from "next/server";
import { adminKey } from "@/lib/env";
import { ADMIN_COOKIE, ADMIN_TOKEN_MAX_AGE_MS, issueAdminToken, safeEqualKey } from "@/lib/admin-token";

// /admin?key=<正しい鍵> でアクセスされたら、httpOnly Cookie を立てて
// ?key= を落とした /admin へリダイレクトする。以降はURLに鍵が残らず
// Cookie で認証される(認証済み判定は各ページ/アクションの isAdmin が行う)。
// Server Component のレンダリング中は Cookie を書けないため、この処理は
// middleware で行う必要がある。
// なお ?key= はフォームログイン(/admin/login)への移行期間の経路で、
// ログインが習慣になったら削除する(URLに鍵が残る・履歴に載るため)
export const config = { matcher: "/admin" };

export async function proxy(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  const configured = adminKey();
  if (!key || !configured) return NextResponse.next();

  if (!(await safeEqualKey(key, configured))) return NextResponse.next(); // 不一致はそのまま(ページ側で404)

  const url = req.nextUrl.clone();
  url.searchParams.delete("key");
  const res = NextResponse.redirect(url);
  res.cookies.set(ADMIN_COOKIE, await issueAdminToken(configured), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ADMIN_TOKEN_MAX_AGE_MS / 1000,
    path: "/admin",
  });
  return res;
}
