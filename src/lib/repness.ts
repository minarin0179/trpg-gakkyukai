import type { RepnessItem } from "./math-result";

// グループごとの「特に賛成する意見」(repness の repful_for=agree)の数を数え、
// 相対的に少ないグループを見つける。そうしたグループの気持ちを代弁する意見の
// 投稿を促すのに使う(本家Polisのcomment routingが目指す「各グループを代表する
// 意見をあぶり出す」ことの、投稿側からの補完)。
// 基準は「最多グループの半分以下」。どのグループにも無い(=データ不足)段階では
// 偏りとは言えないので空を返す
export function groupsLackingAgreeRepness(
  repness: Record<string, RepnessItem[]>,
  groupCount: number,
  isValidStatement: (statementId: number) => boolean,
): number[] {
  const counts = Array.from({ length: groupCount }, (_, g) =>
    (repness[String(g)] ?? []).filter(
      (r) => r.repful_for === "agree" && isValidStatement(r.statement_id),
    ).length,
  );
  const max = Math.max(0, ...counts);
  if (max === 0) return [];
  return counts.flatMap((c, g) => (c * 2 <= max ? [g] : []));
}
