// 週次のX投稿のうち、DBに触れない部分(週の区切り・型・投稿文の組み立て)。
// digest.ts はDB(@/db)を読み込むため単体テストから import できない。
// 純関数だけをここに分けて、node --test で直接確かめられるようにしてある。
// digest.ts がこのモジュールを再輸出するので、利用側は "@/lib/digest" だけを見ればよい

export const DAY_MS = 86_400_000;
// 週の区切りは日本時間の月曜0:00。サーバーはUTCで動くため、JSTの壁時計を
// 「UTCとして読める形」に9時間ずらして日付計算する(ローカルタイムゾーンに依存しない)
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function toJstWallClock(d: Date): Date {
  return new Date(d.getTime() + JST_OFFSET_MS);
}

// その日時が属する週(JSTの月曜0:00)の開始時刻を実時刻(UTC)で返す
export function startOfWeekJst(d: Date): Date {
  const j = toJstWallClock(d);
  const mondayBased = (j.getUTCDay() + 6) % 7; // 月曜=0 … 日曜=6
  const midnight = Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate());
  return new Date(midnight - mondayBased * DAY_MS - JST_OFFSET_MS);
}

// 週の窓 [weekStart, weekEnd)。weekEnd は翌週の月曜0:00 JST
export function weekWindow(weekStart: Date): { weekStart: Date; weekEnd: Date } {
  return { weekStart, weekEnd: new Date(weekStart.getTime() + 7 * DAY_MS) };
}

// 直前に終わった週(cronが月曜夜に集計する対象)
export function previousWeekStart(now: Date): Date {
  return startOfWeekJst(new Date(startOfWeekJst(now).getTime() - DAY_MS));
}

// DBの主キーに使う 'YYYY-MM-DD'(JSTの月曜の日付)
export function weekStartKey(weekStart: Date): string {
  return toJstWallClock(weekStart).toISOString().slice(0, 10);
}

// 'YYYY-MM-DD'(JSTの月曜)から実時刻に戻す
export function weekStartFromKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00+09:00`);
}

// URLに使うISO週番号 'YYYY-Www'。ISO 8601では「その週の木曜が属する年」の週になる
export function isoWeekKey(weekStart: Date): string {
  const monday = toJstWallClock(weekStart);
  const thursday = new Date(monday.getTime() + 3 * DAY_MS);
  const year = thursday.getUTCFullYear();
  const week1Monday = isoWeek1Monday(year);
  const week = Math.floor((monday.getTime() - week1Monday) / (7 * DAY_MS)) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

// その年の第1週の月曜(1月4日を含む週)
function isoWeek1Monday(year: number): number {
  const jan4 = Date.UTC(year, 0, 4);
  const mondayBased = (new Date(jan4).getUTCDay() + 6) % 7;
  return jan4 - mondayBased * DAY_MS;
}

// 'YYYY-Www' から週の開始時刻へ。存在しない週(第53週が無い年など)はnull
export function parseWeekKey(key: string): Date | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > 53) return null;
  const monday = isoWeek1Monday(year) + (week - 1) * 7 * DAY_MS;
  const weekStart = new Date(monday - JST_OFFSET_MS);
  // 往復して一致しない指定(その年に第53週が無い等)は無効として扱う
  return isoWeekKey(weekStart) === key ? weekStart : null;
}

// 表示用の期間 「9/1〜9/7」(週の月曜〜日曜、JST)
export function formatWeekRange(weekStart: Date): string {
  const s = toJstWallClock(weekStart);
  const e = new Date(s.getTime() + 6 * DAY_MS);
  return `${s.getUTCMonth() + 1}/${s.getUTCDate()}〜${e.getUTCMonth() + 1}/${e.getUTCDate()}`;
}

// 週の最終日(日曜)の 'YYYY-MM-DD'(JST)。body に入れる期間の終わりは、
// 読み手が見る「月曜〜日曜」に合わせて閉区間の日曜にする
// (集計に使う窓は [weekStart, weekStart+7日) の半開区間で、こちらとは別)
export function weekEndKey(weekStart: Date): string {
  return weekStartKey(new Date(weekStart.getTime() + 6 * DAY_MS));
}

// 保存済みの weekStart('YYYY-MM-DD')から表示用の期間を作る。
// body には範囲の文字列も週キーも持たせず、主キーである週の月曜から毎回導く
// (同じ値を2か所に持つと、片方だけ古い形式のまま残るため)
export function weekRangeOf(weekStartKeyValue: string): string {
  return formatWeekRange(weekStartFromKey(weekStartKeyValue));
}

// 保存済みの weekStart('YYYY-MM-DD')からURLに使う週キー 'YYYY-Www' を作る
export function weekKeyOf(weekStartKeyValue: string): string {
  return isoWeekKey(weekStartFromKey(weekStartKeyValue));
}

// digests.body に保存する集計結果。投稿文そのものは text 列に保存するので、
// body は「その週に何があったか」を後から見返すための記録として持つ。
// 形は version で明示的に版管理する。読み出し側は isDigestBody で版を確かめ、
// 古い版の行は下書き(text)だけを表示に使う(再生成すれば最新の形式になる)
export const DIGEST_BODY_VERSION = 3;

// 投稿に載せるテーマ。タイトルだけを読ませる投稿なので、
// 中身ではなく並び順の根拠(その週に投票した人数)だけを添える
export type DigestTheme = {
  id: string;
  title: string;
  weekVoters: number; // その週に投票した人数(重複なし)
};

export type DigestTotals = {
  votes: number;
  statements: number;
  newThemes: number;
  voters: number;
};

export type DigestBody = {
  version: 3;
  weekStart: string; // 'YYYY-MM-DD'(JSTの月曜)
  weekEnd: string; // 'YYYY-MM-DD'(JSTの日曜。閉区間の終わり)
  totals: DigestTotals;
  themes: DigestTheme[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// jsonbの中身は型では保証されないので、使う前に形を確かめる
// (math-result.ts の isMathResultJson と同じ方針)。
// version が合わない行(旧形式)もここで弾く
export function isDigestBody(v: unknown): v is DigestBody {
  if (!isRecord(v)) return false;
  if (v.version !== DIGEST_BODY_VERSION) return false;
  if (typeof v.weekStart !== "string" || typeof v.weekEnd !== "string") return false;
  if (!isRecord(v.totals)) return false;
  for (const key of ["votes", "statements", "newThemes", "voters"]) {
    if (typeof v.totals[key] !== "number") return false;
  }
  return Array.isArray(v.themes);
}

// Xの文字数。上限は「重み付き280」で、全角は2・半角は1として数える
// (=全角140字)。URLはt.coで短縮されるため、実際の長さに関係なく23文字扱い
export const X_MAX_UNITS = 280;
const X_URL_UNITS = 23;
const URL_RE = /https?:\/\/\S+/g;

export function xLength(text: string): number {
  const urls = text.match(URL_RE) ?? [];
  let units = urls.length * X_URL_UNITS;
  for (const ch of text.replace(URL_RE, "")) {
    // Xの重み付けは概ね「ラテン文字など(U+0000〜U+10FF)が1、それ以外が2」。
    // 日本語・絵文字はすべて2として数える(安全側)
    units += (ch.codePointAt(0) ?? 0) <= 0x10ff ? 1 : 2;
  }
  return units;
}

// 単位数(xLengthの数え方)で切り詰める。切ったときは末尾に「…」を付ける
export function truncateToUnits(text: string, maxUnits: number): string {
  if (xLength(text) <= maxUnits) return text;
  const ellipsis = "…";
  const budget = maxUnits - xLength(ellipsis);
  if (budget <= 0) return "";
  let out = "";
  let used = 0;
  for (const ch of text) {
    const w = (ch.codePointAt(0) ?? 0) <= 0x10ff ? 1 : 2;
    if (used + w > budget) break;
    out += ch;
    used += w;
  }
  return out.length > 0 ? out + ellipsis : "";
}

// 投稿に載せるテーマの上限。集計側のSQLもこの件数だけ取る
export const DIGEST_THEME_LIMIT = 5;
// タイトル1件に割く上限(全角24字)。テーマのタイトルは最大100字なので、
// 長いものは「…」で切って1行に収める
const TITLE_MAX_UNITS = 48;

const THEMES_HEADER = "投票が多かったテーマ";
const NO_THEMES_LINE = "今週は投票の多いテーマがありませんでした。";

// Xへの投稿の下書き。伝えるのは「先週よく話されたテーマの名前」だけにして、
// 続きは人気タブで読んでもらう。見出し2行とURLは必ず入れ、
// 残った枠にタイトルを上から詰める(枠に入らないタイトルは落とす)
export function composeDigestText(body: DigestBody, url: string): string {
  const header = `今週のTRPG学級会(${weekRangeOf(body.weekStart)})`;
  const lines: string[] = [header, THEMES_HEADER];
  // 行を足すたびに「改行1つ + その行」を加算する。URLの前の改行も先に確保しておく
  let used = xLength(header) + 1 + xLength(THEMES_HEADER) + 1 + xLength(url);

  for (const theme of body.themes.slice(0, DIGEST_THEME_LIMIT)) {
    const title = truncateToUnits(theme.title, TITLE_MAX_UNITS);
    if (!title) continue;
    const line = `「${title}」`;
    if (used + 1 + xLength(line) > X_MAX_UNITS) break;
    lines.push(line);
    used += 1 + xLength(line);
  }

  // 1件も載らない週は、見出しだけが浮かないよう理由を書く
  if (lines.length === 2) lines.push(NO_THEMES_LINE);

  lines.push(url);
  return lines.join("\n");
}
