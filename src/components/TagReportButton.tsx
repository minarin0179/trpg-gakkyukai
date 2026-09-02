"use client";

import { useActionState, useId, useState } from "react";
import { submitReportAction } from "@/app/actions/reports";
import { type FormState } from "@/lib/action-result";

// タグの通報(削除依頼)。どのタグかを選んで理由を送る。
// タグの削除はユーザーには開放していないため、これが唯一の削除経路
export function TagReportButton({ tags }: { tags: { id: number; tag: string }[] }) {
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState(String(tags[0]?.id ?? ""));
  const [reason, setReason] = useState("");
  // 開閉するフォームと開くボタンを支援技術で結びつけるためのid
  const panelId = useId();
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    submitReportAction,
    {},
  );

  if (tags.length === 0) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls={panelId}
        className="text-xs text-stone-500 underline hover:text-stone-700"
      >
        タグを通報
      </button>
    );
  }

  if (state.done) {
    return (
      <p className="text-xs text-stone-600">
        通報を受け付けました。基準に照らして対応します。
      </p>
    );
  }

  return (
    <form
      id={panelId}
      action={formAction}
      className="mt-1 flex w-full flex-col gap-2 rounded-md border border-stone-400 bg-stone-50 p-3"
    >
      <input type="hidden" name="targetType" value="tag" />
      <input type="hidden" name="targetId" value={targetId} />
      <label className="text-xs text-stone-700">
        対象のタグ:
        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="ml-2 rounded-md border border-stone-400 bg-white px-2 py-1 text-xs"
        >
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.tag}
            </option>
          ))}
        </select>
      </label>
      <textarea
        name="reason"
        required
        minLength={5}
        maxLength={500}
        rows={2}
        placeholder="このタグが不適切な理由を教えてください"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full rounded-md border border-stone-500 bg-white px-2 py-1.5 text-xs"
      />
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-stone-700 px-3 py-1 text-xs text-white disabled:opacity-50"
        >
          {pending ? "送信中..." : "送信"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-stone-600 underline"
        >
          閉じる
        </button>
      </div>
    </form>
  );
}
