"use client";

import { useActionState, useEffect, useState } from "react";
import { submitReportAction } from "@/app/actions/reports";
import { type FormState } from "@/lib/action-result";
import { REMOVAL_CRITERIA_SHORT } from "@/lib/rules";

export function ReportButton({
  targetType,
  targetId,
  onDone,
}: {
  targetType: "theme" | "statement";
  targetId: string;
  // 通報の送信完了時に呼ばれる(投票デッキでは「パスして次へ」に使う)
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    submitReportAction,
    {},
  );

  useEffect(() => {
    if (state.done) onDone?.();
    // onDoneは描画ごとに変わり得るため、完了の一度だけ発火させる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.done]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="shrink-0 whitespace-nowrap text-xs text-stone-500 underline hover:text-stone-700 dark:text-stone-600 dark:hover:text-stone-300"
      >
        通報
      </button>
    );
  }

  if (state.done) {
    return <p className="mt-2 text-xs text-stone-600 dark:text-stone-500">通報を受け付けました。基準に照らして対応します。</p>;
  }

  return (
    <form action={formAction} className="mt-2 flex flex-col gap-2 rounded-md border border-stone-400 bg-stone-50 p-3 dark:border-stone-700 dark:bg-stone-800">
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      <p className="text-xs text-stone-700 dark:text-stone-300">
        削除対象は「{REMOVAL_CRITERIA_SHORT}」のみです。
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
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full rounded-md border border-stone-500 bg-white px-2 py-1.5 text-xs dark:border-stone-700 dark:bg-stone-900"
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
