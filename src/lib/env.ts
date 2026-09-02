// 秘密情報の取得。Vercel上(production/preview)では未設定を例外にして、
// テストキーや既定ソルトで「無音で動き続ける」事故を防ぐ。
// ローカル(VERCEL_ENV未設定)では従来どおり開発用の既定値に落ちる。
// 各getterは呼び出し時に評価する(モジュール読み込み時に投げるとビルドが落ちるため)。
// next/headers や node:crypto に依存しない(proxy.ts からも読み込むため)

// Turnstileの公式テストキー(常に成功)。開発中の既定値として使う
export const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";

const STRICT =
  process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview";

function secret(name: string, devFallback: string | undefined): string | undefined {
  const v = process.env[name];
  if (v) return v;
  if (STRICT) throw new Error(`${name} is not set (VERCEL_ENV=${process.env.VERCEL_ENV})`);
  return devFallback;
}

export function hashSalt(): string {
  return secret("HASH_SALT", "trpg-gakkyukai") as string;
}

export function turnstileSecret(): string {
  return secret("TURNSTILE_SECRET_KEY", TURNSTILE_TEST_SECRET) as string;
}

// Python Function(compute/embed)呼び出し用の内部API鍵。
// cron用シークレットと内部API鍵を分離できるようにする。移行中は CRON_SECRET を流用。
// STRICT環境ではどちらも未設定なら例外(secret() が CRON_SECRET 側で投げる)
export function internalApiKey(): string {
  const dedicated = process.env.INTERNAL_API_KEY;
  if (dedicated) return dedicated;
  return secret("CRON_SECRET", "") as string;
}

// ADMIN_KEY はローカルでは未設定が正常(=管理画面を無効にする)ため undefined を返す
export function adminKey(): string | undefined {
  return secret("ADMIN_KEY", undefined);
}
