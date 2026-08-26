"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
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
