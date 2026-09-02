import type { Metadata } from "next";
import { adminLoginAction } from "../actions";

export const dynamic = "force-dynamic";

// 管理画面と同じく検索避け。ログインフォームは公開されるが内容は持たない
export const metadata: Metadata = {
  title: "管理ログイン",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  const { error } = await searchParams;
  const message =
    error === "rate"
      ? "試行回数が上限に達しました。時間を置いてからお試しください。"
      : error
        ? "キーが正しくありません。"
        : null;

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 text-xl font-bold">管理ログイン</h1>
      {message && (
        <p className="mb-4 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
          {message}
        </p>
      )}
      <form action={adminLoginAction} className="flex flex-col gap-3">
        <div>
          <label htmlFor="key" className="mb-1 block text-sm font-medium">
            アクセスキー
          </label>
          <input
            id="key"
            name="key"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded-md border border-stone-400 bg-white px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white"
        >
          ログイン
        </button>
      </form>
    </div>
  );
}
