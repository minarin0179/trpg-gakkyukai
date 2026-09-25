// 毎日のX投稿(週次の投稿が無い日に1テーマを紹介する)のうち、DBに触れない部分。
// digest-text.ts と同じく、単体テストから直接 import できるよう純関数だけを置く。
// daily-pick.ts がこのモジュールを再輸出するので、利用側は "@/lib/daily-pick" だけを見ればよい
import { DAY_MS, X_MAX_UNITS, truncateToUnits, xLength } from "./digest-text";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 紹介の種類。上から順に候補を探す
// new     = 直近24時間に立ったテーマ
// hot     = 直近24時間に投票が多かったテーマ
// revisit = これまでに投票が多かったテーマ(最近紹介したものを除いてランダム)
export type DailyPickKind = "new" | "hot" | "revisit";

export type DailyPick = {
  kind: DailyPickKind;
  id: string;
  title: string;
  voters: number; // new/hot は直近24時間、revisit は累計の投票者数(重複なし)
};

// 日次投稿の目印に使う日付 'YYYY-MM-DD'(JST)
export function jstDateKey(d: Date): string {
  return new Date(d.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

// JSTで月曜か。月曜は週次の投稿の日なので、日次の投稿は出さない
export function isMondayJst(d: Date): boolean {
  return new Date(d.getTime() + JST_OFFSET_MS).getUTCDay() === 1;
}

// 直近24時間の窓 [now-24h, now)
export function dailyWindow(now: Date): { from: Date; to: Date } {
  return { from: new Date(now.getTime() - DAY_MS), to: now };
}

// 「hot」として紹介するのに要る直近24時間の投票者数。1〜2人だと
// 「よく話された」と言えないため、足りない日は revisit に回す
export const HOT_MIN_VOTERS = 3;

const HASHTAG = "#TRPG学級会";

function headerOf(pick: DailyPick): string {
  switch (pick.kind) {
    case "new":
      return "新しいテーマが立ちました";
    case "hot":
      return `今日よく話されたテーマ(${pick.voters}人が投票)`;
    case "revisit":
      return pick.voters > 0
        ? `こんなテーマも話されています(これまでに${pick.voters}人が投票)`
        : "こんなテーマも話されています";
  }
}

// 1テーマを紹介する投稿文。見出し・誘い文・ハッシュタグ・URLは必ず入れ、
// 残りの枠でタイトルを切り詰める。URLはテーマの個別ページにして、
// OGPのカードが付くようにする(一覧へのリンクより押されやすい)
export function composeDailyText(pick: DailyPick, url: string): string {
  const header = headerOf(pick);
  const invite = "意見に賛成・反対で答えて、みんなの考えの分布を見てみませんか";
  // 「」と改行4つ(見出し/タイトル/誘い文/ハッシュタグ/URLの5行)を先に確保する
  const fixed = xLength(header) + xLength(invite) + xLength(HASHTAG) + xLength(url) + 4 + xLength("「」");
  const title = truncateToUnits(pick.title, X_MAX_UNITS - fixed);
  return [header, `「${title}」`, invite, HASHTAG, url].join("\n");
}
