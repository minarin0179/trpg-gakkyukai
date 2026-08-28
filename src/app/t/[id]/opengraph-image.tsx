import { ImageResponse } from "next/og";
import { getTheme } from "@/lib/queries";

export const alt = "TRPG学級会のテーマ";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// 画像に描画する固定テキスト(フォントのサブセット取得に使う)
const STATIC_TEXT =
  "TRPG学級会レスバより、セッションを。賛成/反対/パスで投票して、意見マップをつくろう。0123456789";

// Google Fontsから、描画する文字だけをサブセットしたNoto Sans JPを取得する。
// Satori(next/og)はwoff2を読めないため、非ブラウザUAで truetype を返させる
// (ブラウザUAだとwoff2、IE系だとformat無しの特殊URLになり解析に失敗する)。
async function loadJpFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const api = `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(api, { headers: { "User-Agent": "curl/8.0" } })).text();
    // Satoriが読める truetype/opentype/woff のURLだけを拾う(woff2・format無しは除外)
    const url = css.match(
      /src:\s*url\((https:\/\/[^)]+?)\)\s*format\('(?:truetype|opentype|woff)'\)/,
    )?.[1];
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export default async function OgImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const theme = await getTheme(id).catch(() => null);
  const title = theme?.title ?? "TRPG学級会";
  const fontData = await loadJpFont(title + STATIC_TEXT);
  // 長いタイトルは小さめに
  const titleSize = title.length > 44 ? 52 : title.length > 26 ? 64 : 76;

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#fafaf9",
          padding: "72px 80px",
          borderTop: "14px solid #fcd34d",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
          <div style={{ fontSize: 34, fontWeight: 700, color: "#1c1917" }}>TRPG学級会</div>
          <div style={{ fontSize: 22, color: "#78716c" }}>レスバより、セッションを。</div>
        </div>

        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            overflow: "hidden",
            padding: "24px 0",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: titleSize,
              fontWeight: 700,
              color: "#1c1917",
              lineHeight: 1.35,
            }}
          >
            {title}
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 26, color: "#57534e" }}>
          賛成 / 反対 / パスで投票して、意見マップをつくろう。
        </div>
      </div>
    ),
    {
      ...size,
      fonts: fontData
        ? [{ name: "Noto Sans JP", data: fontData, weight: 700 as const, style: "normal" as const }]
        : undefined,
    },
  );
}
