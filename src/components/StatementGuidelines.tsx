// 意見(ステートメント)投稿時に示すルールと書き方のガイド。
// テーマ投稿の TopicGuidelines と同じ緑/赤パターンで、意見を書く場所にも
// 基準を表示して質の低い投稿を抑える。削除基準(ハードルール)は
// src/lib/rules.ts を唯一の定義元とし、ここでは要約を参照する。

import Link from "next/link";
import { REMOVAL_CRITERIA_SHORT } from "@/lib/rules";

export function StatementGuidelines() {
  return (
    <div className="mb-3 flex flex-col gap-2">
      <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-900">
        <span className="font-semibold">伝わる意見の書き方</span>
        <ul className="mt-1 list-disc pl-5">
          <li>主張は1つだけにする(複数を1つに詰め込まない)</li>
          <li>「賛成 / 反対」で答えられる言い切りの形にする</li>
          <li>特定の人への返信や実名ではなく、一般化した論点として書く</li>
          <li>できれば理由や具体例をひとこと添える</li>
        </ul>
      </div>
      <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-xs leading-relaxed text-rose-900">
        <span className="font-semibold">書けないもの</span>
        <p className="mt-1">
          {REMOVAL_CRITERIA_SHORT}。このテーマと無関係な内容も投稿できません。
          <Link href="/about" className="ml-1 underline">
            ルールの詳細
          </Link>
        </p>
      </div>
    </div>
  );
}
