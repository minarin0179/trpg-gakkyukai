"use client";

import { useActionState, useState } from "react";
import { submitReportAction, type FormState } from "@/app/actions";

export function ReportButton({
  targetType,
  targetId,
}: {
  targetType: "theme" | "statement";
  targetId: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    submitReportAction,
    {},
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-stone-500 underline hover:text-stone-700 dark:text-stone-600 dark:hover:text-stone-300"
      >
        通報
      </button>
    );
  }

  if (state.done) {
    return <p className="mt-2 text-xs text-stone-600 dark:text-stone-500">通報を受け付けました。基準に照らして対応します。</p>;
  }

  return (
    <form action={formAction} className="mt-2 flex flex-col gap-2 rounded-md border border-stone-200 bg-stone-50 p-3 dark:border-stone-700 dark:bg-stone-800">
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      <p className="text-xs text-stone-700 dark:text-stone-300">
        削除対象は「実名個人への攻撃 / 個人情報 / 法令違反 / 機械的スパム」のみです。
        不快・論争的であることは削除理由になりません(
        <a href="/about" className="underline">基準の全文</a>)。
      </p>
      <textarea
        name="reason"
        required
        minLength={5}
        maxLength={500}
        rows={2}
        placeholder="どの基準に該当するか教えてください"
        className="w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-xs dark:border-stone-700 dark:bg-stone-900"
      />
      {state.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-stone-700 px-3 py-1 text-xs text-white dark:bg-stone-200 dark:text-stone-900 disabled:opacity-50"
        >
          {pending ? "送信中..." : "送信"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-stone-600 underline dark:text-stone-500"
        >
          閉じる
        </button>
      </div>
    </form>
  );
}
