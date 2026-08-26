import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold">ページが見つかりません</h1>
      <p className="mt-3 text-sm text-stone-600">
        テーマが削除されたか、URLが間違っている可能性があります。
      </p>
      <Link
        href="/themes"
        className="mt-6 inline-block rounded-md bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-700"
      >
        テーマ一覧へ戻る
      </Link>
    </div>
  );
}
