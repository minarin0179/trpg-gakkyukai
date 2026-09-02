// 管理画面の認証トークンの導出だけを持つモジュール。
// proxy(ミドルウェア相当)と Server Component の両方から読むため、
// Node専用API(crypto モジュール)ではなく Web Crypto だけを使う

export const ADMIN_COOKIE = "gk_admin";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Cookieに入れる値。ADMIN_KEYそのものは入れず、そこから導いたハッシュを入れる。
// 発行側(proxy)と検証側(admin-auth)で必ず同じ式を使うため、ここに一本化する
export async function adminTokenFor(key: string): Promise<string> {
  return sha256Hex(`admin:${key}`);
}
