// プロダクト方針に関わる定数(DESIGN.md参照)

// 構造的沈降: この人数が投票したテーマだけ人気タブに並ぶ
export const PROMOTION_MIN_PARTICIPANTS = 10;

// 再計算の最短間隔(秒)。投票のたびに叩かれても計算が暴走しないための抑制。
// 再計算はテーマの全投票を読み込む(=転送量最大の源)ため、頻度を抑えて転送を削減する。
// 自分の点はクライアント側でライブ投影されるため、全体マップの更新は30分遅れでも
// 体験への影響は小さい。初回計算(マップがまだ無いテーマ)は間隔に関係なく即時実行される
export const RECOMPUTE_MIN_INTERVAL_SEC = 30 * 60;

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

// 類似テーマ検出(テーマ提案時の確認表示)。
// 閾値はコサイン類似度。実データ187件での実測: 重複クラスタは0.93以上に並び、
// 全ペアの95パーセンタイルが0.86。0.90なら取りこぼしより誤検知側に少し倒れるが、
// ブロックではなく確認表示なので許容
export const THEME_SIMILAR_THRESHOLD = 0.9;
export const THEME_SIMILAR_MAX = 3; // 確認表示に出す件数

// テーマ検索の意味検索(埋め込み)。部分一致に加えて、コサイン類似度が閾値以上の
// テーマを関連度順で補完する。実測: 「遅刻」→「キャラシの提出遅れ」が0.849、
// 関連の薄い組は0.83前後に沈むため、0.80は再現率寄りの設定(検索は多少のノイズ許容)
export const SEARCH_SIMILAR_THRESHOLD = 0.8;
export const SEARCH_SEMANTIC_MAX = 20; // 意味検索で補完する最大件数

// 投票ゲート: そのテーマで min(この値, 意見数) 件投票するまで意見を投稿できない。
// 目的は「まず聞いてから話す」文化と投票数の底上げ(重複防止ではない —
// ランダム提示n件で同旨の意見に当たる確率は実測でn=5:約25%、n=20でも約55%であり、
// Nを増やしても重複防止はほぼ伸びない。議論の主要な立場を見るにはn=5で十分)
export const STATEMENT_GATE_VOTES = 5;

// タグ(要望#4580)。誰でも追加可・削除は通報経由のみ。
// 表記揺れはサジェスト(既存タグへの誘導)で抑える
export const TAG_MAX_LENGTH = 20;
export const TAGS_PER_THEME = 8;
export const TAG_SUGGEST_LIMIT = 8;
// 提案フォームで最初に提示する候補タグ(タップで選択)。
// 特別扱いはせず、あくまで入力の出発点。ここに無いタグも自由に付けられる
export const INITIAL_TAGS = [
  "CoC",
  "D&D",
  "ソード・ワールド",
  "GM論",
  "PL論",
  "マナー",
  "セッション運営",
  "シナリオ",
  "オンセ",
  "オフセ",
  "同人・二次創作",
  "配信・動画",
] as const;

// 人気タブの並び順(Hacker News方式の時間減衰ランキング)
// score = 投票者数 / (経過日数 + 2)^GRAVITY
// 新しいテーマほど有利になり、古いテーマは参加者が多くても自然に沈む
export const RANKING_GRAVITY = 1.8;

// テーマ一覧(無限スクロール)の1ページ件数
export const THEMES_PAGE_SIZE = 20;
