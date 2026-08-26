import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "TRPG学級会",
    template: "%s | TRPG学級会",
  },
  description:
    "レスバより、セッションを。TRPGの論点に賛成・反対・パスで投票して、意見の全体像とグループを越えた合意点を見つける場所。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
        <header className="border-b border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-bold tracking-tight">
              TRPG学級会
              <span className="ml-2 hidden text-xs font-normal text-stone-500 sm:inline dark:text-stone-400">
                レスバより、セッションを。
              </span>
            </Link>
            <nav className="flex items-center gap-3 text-sm sm:gap-4">
              <Link
                href="/themes"
                className="text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-stone-100"
              >
                テーマ一覧
              </Link>
              <Link
                href="/new"
                className="rounded-md bg-stone-900 px-3 py-1.5 font-medium text-white hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
              >
                テーマを提案
              </Link>
              <Link
                href="/about"
                className="hidden text-stone-600 hover:text-stone-900 sm:inline dark:text-stone-300 dark:hover:text-stone-100"
              >
                仕組みとルール
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-stone-200 bg-white py-6 text-center text-xs text-stone-500 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400">
          <p>
            Inspired by{" "}
            <a href="https://pol.is" className="underline" rel="noopener">
              Polis
            </a>{" "}
            · Powered by{" "}
            <a
              href="https://github.com/polis-community/red-dwarf"
              className="underline"
              rel="noopener"
            >
              red-dwarf
            </a>
          </p>
        </footer>
      </body>
    </html>
  );
}
