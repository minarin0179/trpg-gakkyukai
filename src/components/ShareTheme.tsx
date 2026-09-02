import { SITE_URL } from "@/lib/site";

// テーマの共有。TRPGの議論は主にXで行われるためXへの共有に一本化する。
// トラッキング目的の外部SDKは使わず、Xのインテントリンクのみ。
// 共有文は「晒し」ではなく「投票への招待」の文面にする。
export function ShareTheme({
  themeId,
  title,
  variant = "theme",
  appearance = "link",
}: {
  themeId: string;
  title: string;
  // report = 結果レポートページの共有(URLと文面をレポート向けにする)
  variant?: "theme" | "report";
  // button = 目立たせたい場所用の塗りボタン(既定は文中リンク)
  appearance?: "link" | "button";
}) {
  const url = `${SITE_URL}/t/${themeId}${variant === "report" ? "/report" : ""}`;
  // 招待の一言＋議題(テーマの問い)を添えて、何の共有か一目で分かるようにする
  const text =
    variant === "report"
      ? `「${title}」の投票結果レポートです。`
      : `この話題について議論してみましょう。\n「${title}」`;
  // URLはtextに改行付きで埋め込み、単独の行にする(url=パラメータだと本文と同じ行に
  // 連結され、後から補足を書き足したときにURLが途中で折り返されて見栄えが悪いため)。
  // ハッシュタグはサイト名の明示と検索での発見性を兼ねて1つだけ入れる
  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${text}\n#TRPG学級会\n${url}`)}`;

  return (
    <a
      href={xUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={
        appearance === "button"
          ? "inline-flex shrink-0 items-center gap-1.5 rounded-md bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-700"
          : "inline-flex items-center gap-1 text-stone-500 underline hover:text-stone-700"
      }
    >
      {/* Xのロゴ。外部スクリプト(widgets.js)は使わない方針のためインラインSVGで描く */}
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3 w-3 fill-current">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      Xで共有
    </a>
  );
}
