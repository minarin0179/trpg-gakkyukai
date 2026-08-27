import { SITE_URL } from "@/lib/site";

// テーマの共有。TRPGの議論は主にXで行われるためXへの共有に一本化する。
// トラッキング目的の外部SDKは使わず、Xのインテントリンクのみ。
// 共有文は「晒し」ではなく「投票への招待」の文面にする。
export function ShareTheme({ themeId, title }: { themeId: string; title: string }) {
  const url = `${SITE_URL}/t/${themeId}`;
  // 招待の一言＋議題(テーマの問い)を添えて、何の共有か一目で分かるようにする
  const text = `この話題について議論してみましょう。\n「${title}」`;
  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;

  return (
    <a
      href={xUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="text-stone-500 underline hover:text-stone-700 dark:text-stone-600 dark:hover:text-stone-300"
    >
      Xで共有
    </a>
  );
}
