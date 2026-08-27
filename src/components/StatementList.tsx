"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { castVoteAction, deleteOwnStatementAction } from "@/app/actions";
import { ReportButton } from "./ReportButton";

type S = { id: number; text: string };

const OPTIONS: { v: number; label: string; on: string }[] = [
  { v: 1, label: "賛成", on: "bg-emerald-600 text-white" },
  { v: 0, label: "パス", on: "bg-stone-400 text-white" },
  { v: -1, label: "反対", on: "bg-rose-600 text-white" },
];

// すべての意見の一覧。各意見に「自分の現在の投票」を表示し、その場で押し直せる(訂正)。
export function StatementList({
  themeId,
  statements,
  myVotes,
  myStatementIds = [],
}: {
  themeId: string;
  statements: S[];
  myVotes: Record<number, number>;
  myStatementIds?: number[];
}) {
  const [votes, setVotes] = useState<Record<number, number>>(myVotes);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const mine = new Set(myStatementIds);

  function remove(statementId: number) {
    if (removingId !== null) return;
    if (!window.confirm("この意見を削除しますか?元に戻せません。")) return;
    setRemovingId(statementId);
    startTransition(async () => {
      const res = await deleteOwnStatementAction(statementId);
      setRemovingId(null);
      if (res.ok) router.refresh(); // 一覧・デッキ・マップを最新化
    });
  }

  // router.refresh() 後もコンポーネントはマウントされたままなので、
  // サーバーから来た最新の投票状態(投票デッキ側での投票を含む)を反映する。
  useEffect(() => {
    setVotes(myVotes);
  }, [myVotes]);

  function change(statementId: number, value: number) {
    if (votes[statementId] === value || pendingId !== null) return;
    setVotes((v) => ({ ...v, [statementId]: value }));
    setPendingId(statementId);
    startTransition(async () => {
      await castVoteAction(themeId, statementId, value);
      setPendingId(null);
      router.refresh(); // マップ・集計を最新化
    });
  }

  return (
    <ul className="flex flex-col gap-2">
      {statements.map((s) => {
        const cur = votes[s.id];
        return (
          <li
            key={s.id}
            className="rounded-md border border-stone-400 bg-white px-3 py-2 text-sm dark:border-stone-800 dark:bg-stone-900"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0">{s.text}</span>
              {mine.has(s.id) ? (
                <button
                  onClick={() => remove(s.id)}
                  disabled={removingId === s.id}
                  className="shrink-0 whitespace-nowrap text-xs text-stone-500 underline hover:text-stone-700 disabled:opacity-50"
                >
                  {removingId === s.id ? "削除中..." : "削除"}
                </button>
              ) : (
                <ReportButton targetType="statement" targetId={String(s.id)} />
              )}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="inline-flex overflow-hidden rounded-md border border-stone-300 dark:border-stone-700">
                {OPTIONS.map((o) => (
                  <button
                    key={o.v}
                    onClick={() => change(s.id, o.v)}
                    disabled={pendingId === s.id}
                    className={`px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
                      cur === o.v
                        ? o.on
                        : "text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {cur === undefined && <span className="text-xs text-stone-500">未回答</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
