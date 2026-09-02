import { turnstileSecret } from "./env";

// Cloudflare Turnstile 検証。
// 開発中は公式テストキー(常に成功)を使い、本番でsecretを差し替える
// (Vercel上で未設定なら env.ts が例外を投げる)。
export async function verifyTurnstile(token: string | null): Promise<boolean> {
  const secret = turnstileSecret();
  if (!token) return false;
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token }),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { success: boolean };
  return data.success;
}

// 本番のサイトキー(公開情報)。ローカル開発では .env.local の
// NEXT_PUBLIC_TURNSTILE_SITE_KEY(公式テストキー、常に成功)で上書きされる
export const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "0x4AAAAAAEdAVLaA8Kgdczhe";
