// 投稿の機械的フィルタ。
//
// 方針: 「構造で判定できるもの」だけを弾く(URL・連絡先・繰り返し等)。
// 単語ベースのNGワードフィルタは意図的に採用しない —
// TRPGの議論では「殺す」「死ぬ」「ロスト」等が正当な語彙であり、
// 意味ベースのフィルタは誤爆で正当な議論を検閲してしまうため。
// 意味的な問題(攻撃・差別など)は通報ベースの事後対応で扱う(rules.ts)。

const PATTERNS: { re: RegExp; reason: string }[] = [
  {
    re: /(?:https?:\/\/|www\.)\S+/i,
    reason: "URLは投稿できません(スパムと外部誘導の防止のため)",
  },
  {
    // 裸ドメイン(example.com など)
    re: /\b[a-z0-9-]+\.(?:com|net|org|jp|io|dev|app|me|cc|xyz|info|site|link|gg|tv)\b/i,
    reason: "URLやドメイン名は投稿できません(スパムと外部誘導の防止のため)",
  },
  {
    re: /[\w.+-]+@[\w-]+\.[\w.]+/,
    reason: "メールアドレスは投稿できません",
  },
  {
    // 日本の電話番号(ハイフンあり/なし)
    re: /\b0\d{1,4}-\d{1,4}-\d{3,4}\b|\b0\d{9,10}\b/,
    reason: "電話番号は投稿できません",
  },
  {
    // SNSの@メンション(英数字ハンドル)。個人特定の入口になるため
    re: /@[A-Za-z0-9_]{3,}/,
    reason: "SNSアカウント名(@〜)は投稿できません(個人の特定につながるため)",
  },
  {
    // 同一文字の過剰な繰り返し(荒らし的な投稿)
    re: /(.)\1{11,}/,
    reason: "同じ文字の過剰な繰り返しは投稿できません",
  },
];

// 問題があればその理由を、なければnullを返す
export function findContentViolation(text: string): string | null {
  for (const { re, reason } of PATTERNS) {
    if (re.test(text)) return reason;
  }
  return null;
}
