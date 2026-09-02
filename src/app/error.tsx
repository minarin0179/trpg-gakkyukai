"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  // Vercelのランタイムログに残す。表示はしない(内部情報を閲覧者に見せないため)
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold">エラーが発生しました</h1>
      <p className="mt-3 text-sm text-stone-600">
        一時的な問題の可能性があります。少し待ってからもう一度お試しください。
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-md bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-700"
      >
        再読み込み
      </button>
    </div>
  );
}
