// 「ほかのテーマ」の枠(スロット)の定義。DBに触れない部分だけをここに置く。
// 理由: ラベルはテーマページ(server)と投票デッキ(client)の両方が使うため、
// DBを読み込む queries/next-theme.ts に置くとクライアント側から参照できない。

export type RelatedReason = "related" | "trending" | "random";

export type RelatedTheme = {
  id: string;
  title: string;
  voterCount: number;
  statementCount: number;
  reason: RelatedReason;
};

// 枠の優先順。タグの重なりと人気だけで選ぶと候補が同じ色に偏る(似たテーマばかり出る)ため、
// 「近いもの」「いま動いているもの」「おまかせ」を1枠ずつ出す。
// 1件しか出せない場所(投票後の「次のテーマ」)はこの順で先頭を採る
export const RELATED_REASON_ORDER: readonly RelatedReason[] = ["related", "trending", "random"];

export const RELATED_REASON_LABELS: Record<RelatedReason, string> = {
  related: "関連するテーマ",
  trending: "いま動いているテーマ",
  random: "おまかせ",
};

// 1枠だけ出す画面のための選択。呼び出し側から渡る配列の並びに依存せず、
// 常に RELATED_REASON_ORDER の優先順で決まるようにしておく
export function pickPrimaryRelatedTheme(items: RelatedTheme[]): RelatedTheme | null {
  for (const reason of RELATED_REASON_ORDER) {
    const found = items.find((item) => item.reason === reason);
    if (found) return found;
  }
  return items[0] ?? null;
}
