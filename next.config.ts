import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 開発時にLAN内の実機(スマホ等)から http://<WSLのIP>:3000 でアクセスできるようにする。
  // 本番には影響しない(dev専用設定)
  allowedDevOrigins: ["192.168.191.79"],
  // 正規ドメイン以外(www・vercel.appエイリアス)を恒久リダイレクト。
  // Turnstileのホスト名不一致(エラー110200)の防止とSEOの正規化を兼ねる
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.trpg-gakkyukai.com" }],
        destination: "https://trpg-gakkyukai.com/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "trpg-gakkyukai.vercel.app" }],
        destination: "https://trpg-gakkyukai.com/:path*",
        permanent: true,
      },
      // 旧「結果ページ」のパス。/report へ改名(本家Polisの用語 Report に合わせた)。
      // 告知済みで外部にURLが出ているため恒久リダイレクトで受ける
      {
        source: "/t/:id/results",
        destination: "/t/:id/report",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
