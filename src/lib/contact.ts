// 問い合わせカテゴリ。選択肢の並び自体が「何を送る場所か」の案内を兼ねる
export const CONTACT_CATEGORIES = [
  "不具合の報告",
  "投稿の削除依頼",
  "使い方の質問",
  "機能の要望・改善案",
  "その他",
] as const;

export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];
