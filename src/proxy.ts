import { NextRequest, NextResponse } from "next/server";
import { adminKey } from "@/lib/env";
import { ADMIN_COOKIE, adminTokenFor } from "@/lib/admin-token";

// /admin?key=<正しい鍵> でアクセスされたら、httpOnly Cookie を立てて
// ?key= を落とした /admin へリダイレクトする。以降はURLに鍵が残らず
// Cookie で認証される(認証済み判定は各ページ/アクションの isAdmin が行う)。
// Server Component のレンダリング中は Cookie を書けないため、この処理は
// middleware で行う必要がある。
export const config = { matcher: "/admin" };

export async function proxy(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  const configured = adminKey();
  if (!key || !configured) return NextResponse.next();

  // ハッシュ同士の比較(生の鍵長の露出やタイミング差を抑える)
  const [kh, ch] = await Promise.all([adminTokenFor(key), adminTokenFor(configured)]);
  if (kh !== ch) return NextResponse.next(); // 不一致はそのまま(ページ側で404)

  const url = req.nextUrl.clone();
  url.searchParams.delete("key");
  const res = NextResponse.redirect(url);
  res.cookies.set(ADMIN_COOKIE, await adminTokenFor(configured), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/admin",
  });
  return res;
}
