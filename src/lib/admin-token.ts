// 管理画面の認証トークンの発行・検証だけを持つモジュール。
// proxy(ミドルウェア相当)と Server Component の両方から読むため、
// Node専用API(crypto モジュール)ではなく Web Crypto だけを使う

export const ADMIN_COOKIE = "gk_admin";

// トークンの有効期間(30日)。発行時刻を署名に含めることで、
// Cookieが漏れても期限を過ぎれば使えなくなる(以前の鍵ハッシュだけの方式は無期限だった)
export const ADMIN_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
}

async function hmacHex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return toHex(sig);
}

// 先頭一致で打ち切らずに比較する(一致した文字数が時間差に出ないようにする)。
// 長さが違えばその時点で不一致なので、そこだけは早期に返してよい
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// 鍵そのものの突き合わせ。生の鍵長の露出やタイミング差を抑えるため、
// 双方のSHA-256を取ってから固定時間で比較する
export async function safeEqualKey(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  return constantTimeEqual(ha, hb);
}

// Cookieに入れる値。ADMIN_KEYそのものは入れず、発行時刻とその署名を入れる。
// 発行側(proxy・ログイン)と検証側(admin-auth)で必ず同じ式を使うため、ここに一本化する
export async function issueAdminToken(key: string, issuedAtMs = Date.now()): Promise<string> {
  return `${issuedAtMs}.${await hmacHex(key, `admin:${issuedAtMs}`)}`;
}

// トークンの検証。形式・期限・署名の順に確認する
export async function verifyAdminToken(
  key: string,
  token: string,
  maxAgeMs: number,
): Promise<boolean> {
  const m = /^(\d{1,15})\.([0-9a-f]{64})$/.exec(token);
  if (!m) return false;
  const issuedAtMs = Number(m[1]);
  const age = Date.now() - issuedAtMs;
  // 未来日付(時計のずれや細工)も期限切れも受け付けない
  if (age < 0 || age > maxAgeMs) return false;
  return constantTimeEqual(m[2], await hmacHex(key, `admin:${issuedAtMs}`));
}
