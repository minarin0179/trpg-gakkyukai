// プロダクト方針に関わる定数(DESIGN.md参照)

// 構造的沈降: この人数が投票したテーマだけメイン一覧に昇格する
export const PROMOTION_MIN_PARTICIPANTS = 10;

// 再計算の最短間隔(秒)。投票のたびに叩かれても計算が暴走しないための抑制
export const RECOMPUTE_MIN_INTERVAL_SEC = 20;

export const THEME_TITLE_MAX = 100;
export const THEME_DESCRIPTION_MAX = 2000;
export const STATEMENT_MAX = 280;
export const SEED_STATEMENTS_MAX = 10;
