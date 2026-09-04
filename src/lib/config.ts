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

// お問い合わせフォームの上限
export const CONTACT_BODY_MAX = 2000;
export const CONTACT_REPLY_TO_MAX = 200;
// 連絡先(任意入力)を対応済みから何日で消すか。プライバシーポリシーは期間を
// 約束していないため、これは運営内部の保持ルール(文言は変更しない)
export const CONTACT_REPLY_TO_RETENTION_DAYS = 90;

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
// 表記揺れは「語彙一覧から選ぶ」UIで抑える(候補の見逃しを構造的に防ぐ)。
// 語彙の唯一の真実はDB(theme_tags)で、候補は使用数順に導出する(configでの
// 初期タグ管理は全テーマへのタグ付け完了に伴い廃止)
export const TAG_MAX_LENGTH = 20;
export const TAGS_PER_THEME = 8;
// 候補一覧に出す既存タグの最大数(一覧できる量に抑える)
export const TAG_VOCABULARY_LIMIT = 40;

// 人気タブの並び順(Hacker News方式の時間減衰ランキング)
// score = 投票者数 / (経過日数 + 2)^GRAVITY
// 新しいテーマほど有利になり、古いテーマは参加者が多くても自然に沈む
export const RANKING_GRAVITY = 1.8;

// テーマ一覧(無限スクロール)の1ページ件数
export const THEMES_PAGE_SIZE = 20;

// 意見マップに載る(=クラスタに割り当てられる)のに必要な最低投票数。
// 計算側の api/_logic.py の POLIS_MIN_VOTE_THRESHOLD と同じ値で、
// 実際に使われた閾値は計算結果の threshold_used に入る
// (意見数がこれより少ないテーマではその意見数まで下がる)。
// ここはUI側(説明文・暫定表示の判定)の既定値として持つ
export const MAP_MIN_VOTES = 7;

// 図(意見コンパス・割れ方のbeeswarm)を出す最低件数。
// 点が数個だと図として読めないので、それ未満はセクションごと出さない
export const CHART_MIN_ITEMS = 5;

// テーマ提案フォームの類似チェックを走らせるまでの入力停止時間(ミリ秒)
export const SIMILAR_CHECK_DEBOUNCE_MS = 600;

// 参加者cookieの有効期間(秒)。アカウントレスなので、これが切れると
// 過去の投票と結び付かなくなる(=別人として扱われる)ため長めに取る
export const PARTICIPANT_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 400;

// レート制限の上限(kind別)。内容ではなく流量で制御する
// (無審査設計の前提となる対策)。
// *_ip はCGNAT(モバイル回線等で多人数が同一IPを共有)を考慮し、
// cookie側の上限より大幅に緩くして正規ユーザーの巻き添えを防ぐ。
// UIの案内文もこの値から組み立てるため、ここが唯一の定義になる
const DAY_MS = 24 * 60 * 60 * 1000;
export const RATE_LIMITS = {
  theme_create: { max: 3, windowMs: DAY_MS },
  statement_create: { max: 30, windowMs: DAY_MS },
  statement_create_ip: { max: 100, windowMs: DAY_MS },
  report_create: { max: 20, windowMs: DAY_MS },
  // 投票(IP×テーマ単位)。上限はテーマの意見数に比例するため、
  // 呼び出し側が maxOverride で渡す。max: 0 は「渡し忘れたら常に拒否」の安全側の既定
  vote_ip_theme: { max: 0, windowMs: DAY_MS },
  // 類似テーマのライブチェック(入力デバウンスごとに1回)。埋め込み計算の乱用防止
  similar_check: { max: 300, windowMs: DAY_MS },
  // テーマ検索の意味検索(検索1回につき1回)。超過時は部分一致のみに縮退する
  search_embed: { max: 300, windowMs: DAY_MS },
  // タグ付与(cookie/IPの二重計数)
  tag_add: { max: 30, windowMs: DAY_MS },
  tag_add_ip: { max: 100, windowMs: DAY_MS },
  // 管理画面のログイン試行(IP単位)。鍵の総当たりを止めるのが目的で、
  // 運営自身の打ち直しには十分足りる回数にしてある
  admin_login: { max: 20, windowMs: DAY_MS },
} as const;

// DBのkind列の enum もこの表から導出する(schema.ts)
export type RateKind = keyof typeof RATE_LIMITS;

// テーマページ下部の「ほかのテーマ」欄に出す件数(回遊用。多すぎると一覧と重複する)
export const RELATED_THEMES_COUNT = 3;
