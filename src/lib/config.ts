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

// 投票の水増し対策(IP×テーマ単位のレート制限)。
// 正規ユーザー1人が1テーマで投じる票は最大でも意見数なので、上限を
// 「意見数 × VOTE_IP_THEME_PER_STATEMENT」にすれば、同一IP(CGNAT・
// イベント会場等)にその人数がいても全員がフル参加できる。
// 人間には実質届かず、Cookie再発行やスクリプトによる水増しだけが頭打ちになる。
export const VOTE_IP_THEME_PER_STATEMENT = 30;
// 意見が極端に少ないテーマでの下限(再投票の訂正や人数の揺らぎの余裕)
export const VOTE_IP_THEME_MIN = 100;

// 人気タブの並び順(Hacker News方式の時間減衰ランキング)
// score = 投票者数 / (経過日数 + 2)^GRAVITY
// 新しいテーマほど有利になり、古いテーマは参加者が多くても自然に沈む
export const RANKING_GRAVITY = 1.8;

// テーマ一覧(無限スクロール)の1ページ件数
export const THEMES_PAGE_SIZE = 20;
