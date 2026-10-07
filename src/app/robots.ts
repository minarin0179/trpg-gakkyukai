import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    // タグ絞り込みは複数選択の組み合わせでURLが無限に増えるため、クローラーには
    // 辿らせない(実測: GPTBotが1日3.5万回 /themes?tag=... を取得しDBと関数を消費した)。
    // 検索は検索語ごとに関数実行になるので同様。ランダムに開くは毎回別テーマへ飛ぶだけ。
    // 旧クエリ式URL(/themes?)は新パスへリダイレクトするが、除外は念のため残す。
    // 一覧の各タブ・各テーマページ・レポートは従来どおり許可する
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/themes?",
          "/themes/tag/",
          "/themes/search",
          "/themes/random",
          "/api/",
          "/admin",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
