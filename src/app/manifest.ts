import type { MetadataRoute } from "next";

// PWAマニフェスト(最小構成)。ホーム画面への追加とスタンドアロン表示のみを
// 提供する。Service Worker(オフライン対応)は意図的に入れない —
// 投票・投稿はネットワーク必須で、キャッシュの不整合リスクに見合う利点がないため
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TRPG学級会",
    short_name: "TRPG学級会",
    description: "TRPGにまつわる論点を、投票で見える化する意見マップ",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
