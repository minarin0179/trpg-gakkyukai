// プロダクト方針に関わる定数(DESIGN.md参照)

// 構造的沈降: この人数が投票したテーマだけ人気タブに並ぶ
export const PROMOTION_MIN_PARTICIPANTS = 10;

// 再計算の最短間隔(秒)。投票のたびに叩かれても計算が暴走しないための抑制。
// 再計算はテーマの全投票を読み込む(=転送量最大の源)ため、頻度を抑えて転送を削減する。
// 大きくするほどマップ更新は遅くなる(60秒なら実害小)。
export const RECOMPUTE_MIN_INTERVAL_SEC = 60;

export const THEME_TITLE_MAX = 100;
export const THEME_DESCRIPTION_MAX = 2000;
export const STATEMENT_MAX = 140;
export const SEED_STATEMENTS_MAX = 10;

// 人気タブの並び順(Hacker News方式の時間減衰ランキング)
// score = 投票者数 / (経過日数 + 2)^GRAVITY
// 新しいテーマほど有利になり、古いテーマは参加者が多くても自然に沈む
export const RANKING_GRAVITY = 1.8;

// テーマ一覧(無限スクロール)の1ページ件数
export const THEMES_PAGE_SIZE = 20;
