// タイトル埋め込みの取得(類似テーマ検出用)。
// 計算本体は api/embed.py (ruri-v3-30m ONNX)。呼び出し方は recompute.ts と同じ
// パターン(本番エイリアス経由+内部キー認証)。
//
// 失敗時はnullを返し、呼び出し側は類似チェックをスキップして投稿を通す
// (チェックは確認を促すだけの補助機能なので、これが投稿を止めてはいけない)。

function embedEndpoint(): string {
  if (process.env.EMBED_URL) return process.env.EMBED_URL; // ローカル開発用
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (host) return `https://${host}/api/embed`;
  throw new Error("EMBED_URL or VERCEL_PROJECT_PRODUCTION_URL must be set");
}

// コールドスタート(モデルロードで1〜2秒)を見込んだタイムアウト
const EMBED_TIMEOUT_MS = 10_000;

export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);
  try {
    const res = await fetch(embedEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": process.env.CRON_SECRET ?? "",
      },
      body: JSON.stringify({ texts }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`embed failed: ${res.status} ${await res.text()}`);
      return null;
    }
    const data = (await res.json()) as { vectors?: number[][] };
    return Array.isArray(data.vectors) && data.vectors.length === texts.length
      ? data.vectors
      : null;
  } catch (e) {
    console.error("embed failed:", e);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
