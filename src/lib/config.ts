// プロダクト方針に関わる定数(DESIGN.md参照)

// 構造的沈降: この人数が投票したテーマだけメイン一覧に昇格する
export const PROMOTION_MIN_PARTICIPANTS = 10;

// マップに自分の点が載るのに必要な投票数(Polis標準の7票ルール)。
// 意見数がこれ未満のテーマでは意見数まで下がる。api/_logic.py と合わせること
export const MAP_VOTE_THRESHOLD = 7;

// 再計算の最短間隔(秒)。投票のたびに叩かれても計算が暴走しないための抑制
export const RECOMPUTE_MIN_INTERVAL_SEC = 20;

export const THEME_TITLE_MAX = 100;
export const THEME_DESCRIPTION_MAX = 2000;
export const STATEMENT_MAX = 140;
export const SEED_STATEMENTS_MAX = 10;

// メイン一覧の並び順(Hacker News方式の時間減衰ランキング)
// score = 投票者数 / (経過日数 + 2)^GRAVITY
// 新しいテーマほど有利になり、古いテーマは参加者が多くても自然に沈む
export const RANKING_GRAVITY = 1.8;
