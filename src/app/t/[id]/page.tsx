import { notFound } from "next/navigation";
import {
  getTheme,
  getThemeCounts,
  getUnvotedStatements,
  getVisibleStatements,
  getMathResult,
} from "@/lib/queries";
import { getParticipantId } from "@/lib/participant";
import type { MathResultJson } from "@/lib/recompute";
import { VoteDeck } from "@/components/VoteDeck";
import { StatementForm } from "@/components/StatementForm";
import { OpinionMap, type PublicMathResult } from "@/components/OpinionMap";
import { ReportButton } from "@/components/ReportButton";
import { formatRelativeDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ThemePage({ params }: PageProps<"/t/[id]">) {
  const { id } = await params;
  const theme = await getTheme(id);
  if (!theme) notFound();

  const participantId = await getParticipantId();
  const [counts, unvoted, allStatements, mathRow] = await Promise.all([
    getThemeCounts(id),
    getUnvotedStatements(id, participantId),
    getVisibleStatements(id),
    getMathResult(id),
  ]);

  // pidMap(参加者UUID→行列index)はサーバー内でのみ使い、クライアントには渡さない
  const raw = (mathRow?.result ?? null) as MathResultJson | null;
  let myIndex: number | null = null;
  let publicResult: PublicMathResult | null = null;
  if (raw) {
    myIndex = participantId != null ? (raw.pidMap?.[participantId] ?? null) : null;
    const { pidMap: _pidMap, ...rest } = raw;
    publicResult = rest as PublicMathResult;
  }

  const statementTexts: Record<number, string> = {};
  for (const s of allStatements) statementTexts[s.id] = s.text;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">{theme.title}</h1>
        {theme.description && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700 dark:text-stone-300">{theme.description}</p>
        )}
        <div className="mt-2 flex items-center gap-3 text-xs text-stone-600 dark:text-stone-500">
          <span>
            {counts.voterCount}人が投票 · 意見{allStatements.length}件 · {formatRelativeDate(theme.createdAt)}
          </span>
          <ReportButton targetType="theme" targetId={theme.id} />
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-stone-700 dark:text-stone-300">投票する</h2>
        <VoteDeck themeId={theme.id} statements={unvoted} />
      </section>

      <section id="post" className="scroll-mt-20">
        <h2 className="mb-2 text-sm font-semibold text-stone-700 dark:text-stone-300">意見を投稿する</h2>
        <StatementForm themeId={theme.id} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-stone-700 dark:text-stone-300">意見マップ</h2>
        <OpinionMap result={publicResult} myIndex={myIndex} statementTexts={statementTexts} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-stone-700 dark:text-stone-300">
          すべての意見({allStatements.length})
        </h2>
        <ul className="flex flex-col gap-2">
          {allStatements.map((s) => (
            <li
              key={s.id}
              className="flex items-start justify-between gap-3 rounded-md border border-stone-400 bg-white px-3 py-2 text-sm dark:border-stone-800 dark:bg-stone-900"
            >
              <span>{s.text}</span>
              <ReportButton targetType="statement" targetId={String(s.id)} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
