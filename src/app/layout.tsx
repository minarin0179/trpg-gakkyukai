import type { Metadata } from "next";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "TRPG学級会",
    template: "%s | TRPG学級会",
  },
  description:
    "レスバより、セッションを。TRPGの論点に賛成・反対・パスで投票して、意見の全体像とグループを越えた合意点を見つける場所。登録不要・匿名。",
  openGraph: {
    type: "website",
    siteName: "TRPG学級会",
    locale: "ja_JP",
    title: "TRPG学級会",
    description:
      "レスバより、セッションを。TRPGの論点に投票して、意見の全体像と合意点を見つける場所。登録不要・匿名。",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full scroll-smooth antialiased">
      <body className="flex min-h-full flex-col bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
        <header className="border-b border-stone-400 bg-white dark:border-stone-800 dark:bg-stone-900">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-2 px-3 py-3 sm:px-4">
            <Link href="/" className="whitespace-nowrap text-base font-bold tracking-tight sm:text-lg">
              TRPG学級会
              <span className="ml-2 hidden text-xs font-normal text-stone-600 sm:inline dark:text-stone-500">
                レスバより、セッションを。
              </span>
            </Link>
            <nav className="flex shrink-0 items-center gap-3 text-xs sm:gap-4 sm:text-sm">
              <Link
                href="/about"
                className="whitespace-nowrap text-stone-700 hover:text-stone-900"
              >
                <span className="sm:hidden">ルール</span>
                <span className="hidden sm:inline">ルールと仕組み</span>
              </Link>
              <Link
                href="/themes"
                className="whitespace-nowrap text-stone-700 hover:text-stone-900"
              >
                テーマ一覧
              </Link>
              <Link
                href="/new"
                className="whitespace-nowrap rounded-md bg-stone-900 px-2.5 py-1.5 font-medium text-white hover:bg-stone-700 sm:px-3"
              >
                テーマを提案
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-stone-400 bg-white py-6 text-center text-xs text-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-500">
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
            </a>{" "}
            · Illustrations by{" "}
            <a href="https://loosedrawing.com/" className="underline" rel="noopener">
              Loose Drawing
            </a>
          </p>
          <p className="mt-2">
            <Link href="/about" className="underline">
              ルールと仕組み
            </Link>
            {" · "}
            <Link href="/terms" className="underline">
              利用規約
            </Link>
            {" · "}
            <Link href="/privacy" className="underline">
              プライバシーポリシー
            </Link>
            {" · "}
            <Link href="/contact" className="underline">
              お問い合わせ
            </Link>
          </p>
          <p className="mt-2">
            開発・運営:{" "}
            <a href="https://x.com/minarin0179" className="underline" rel="noopener">
              @minarin0179
            </a>
          </p>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
