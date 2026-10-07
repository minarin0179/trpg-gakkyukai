import type { NextConfig } from "next";

// 開発時にLAN内の実機(スマホ等)から http://<WSLのIP>:3000 でアクセスできるようにする。
// 本番には影響しない(dev専用設定)。IPは環境ごとに変わるので .env.local から読む
const devAllowedOrigins = (process.env.DEV_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins: devAllowedOrigins,
  // 最小限のセキュリティヘッダ。投票はワンクリックのため
  // クリックジャッキング対策(frame-ancestors)が主目的。
  // 完全なCSPはTurnstileとNextのインラインscriptの都合で
  // Report-Onlyから段階導入する予定。
  // なおTurnstileのiframeは自ページの「中」に描かれる(こちらが親)ため、
  // 自ページへのframe-ancestors 'none' の影響は受けない
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
          },
        ],
      },
    ];
  },
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
      // テーマ一覧の旧クエリ式URL(?tab= / ?tag= / ?q=)をパス式へ。一覧を ISR にするため
      // (クエリを読むとページ全体が動的描画になる)。X 投稿や共有済みリンクを受ける。
      // 旧ページと同じ優先順位(タグ > 検索語 > タブ)で並べる。value で一致させた
      // クエリは遷移先に引き継がれない(tab=... が残ってループしない)
      {
        source: "/themes",
        has: [
          { type: "query", key: "tag", value: "(?<tag>.+)" },
          { type: "query", key: "tagmode", value: "and" },
        ],
        destination: "/themes/tag/:tag/all",
        permanent: true,
      },
      {
        source: "/themes",
        has: [{ type: "query", key: "tag", value: "(?<tag>.+)" }],
        destination: "/themes/tag/:tag",
        permanent: true,
      },
      {
        source: "/themes",
        has: [{ type: "query", key: "q" }],
        destination: "/themes/search",
        permanent: true,
      },
      ...(["active", "unread", "mine", "proposed"] as const).map((tab) => ({
        source: "/themes",
        has: [{ type: "query" as const, key: "tab", value: tab }],
        destination: `/themes/${tab}`,
        permanent: true,
      })),
      {
        source: "/themes",
        has: [{ type: "query", key: "tab", value: "fresh" }],
        destination: "/themes",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
