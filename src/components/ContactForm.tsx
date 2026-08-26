"use client";

import { useActionState, useState } from "react";
import { submitContactAction, type FormState } from "@/app/actions";

export function ContactForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    submitContactAction,
    {},
  );
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState("");

  if (state.done) {
    return (
      <p className="rounded-lg border border-stone-400 bg-white p-6 text-center text-sm text-stone-700">
        送信しました。お問い合わせありがとうございます。
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="body" className="mb-1 block text-sm font-medium">
          内容
        </label>
        <textarea
          id="body"
          name="body"
          required
          minLength={5}
          maxLength={2000}
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="不具合の報告、削除依頼、その他ご意見など"
          className="w-full rounded-md border border-stone-400 bg-white px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="replyTo" className="mb-1 block text-sm font-medium">
          返信先(任意)
        </label>
        <input
          id="replyTo"
          name="replyTo"
          maxLength={200}
          value={replyTo}
          onChange={(e) => setReplyTo(e.target.value)}
          placeholder="返信が必要な場合のみ(Xアカウント、メールアドレスなど)"
          className="w-full rounded-md border border-stone-400 bg-white px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-stone-600">
          記入は任意です。書かれた連絡先は問い合わせ対応にのみ使用します
        </p>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
      >
        {pending ? "送信中..." : "送信する"}
      </button>
    </form>
  );
}
