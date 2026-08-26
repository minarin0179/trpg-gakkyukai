import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "TRPG学級会",
    template: "%s | TRPG学級会",
  },
  description:
    "TRPGの論点に賛成・反対・パスで投票して、対立の地図と合意点をみんなで描く場所。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-stone-50 text-stone-900">
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-bold tracking-tight">
              TRPG学級会
              <span className="ml-2 hidden text-xs font-normal text-stone-500 sm:inline">
                対立の地図を、みんなで描く
              </span>
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/new" className="rounded-md bg-stone-900 px-3 py-1.5 font-medium text-white hover:bg-stone-700">
                テーマを提案
              </Link>
              <Link href="/about" className="text-stone-600 hover:text-stone-900">
                仕組みとルール
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-stone-200 bg-white py-6 text-center text-xs text-stone-500">
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
