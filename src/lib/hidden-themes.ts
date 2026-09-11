// 「このテーマを表示しない」の保存と購読。自分の端末だけの設定で、サーバーには
// 送らない(投票やランキングには一切影響しない)。保存先は投票の個人化と同じ
// localStorage なので、cookie やサイトデータを消すと戻る(アカウントレスの割り切り)。
//
// 一覧での戻し方に備えて id だけでなくタイトルも持つ(非表示中のテーマは一覧の
// 取得結果に含まれていても除外するので、タイトルを別途取りに行かずに済むように)。

import { useSyncExternalStore } from "react";

export type HiddenTheme = { id: string; title: string; at: number };

export const HIDDEN_THEMES_KEY = "gk_hidden_themes";
// 上限。古いものから落とす(localStorage を際限なく育てない)
export const HIDDEN_THEMES_MAX = 200;
const EVENT = "gk-hidden-themes";

// ---- 純関数(テスト対象) ----

export function parseHiddenThemes(raw: string | null): HiddenTheme[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter(
      (x): x is HiddenTheme =>
        typeof x === "object" &&
        x !== null &&
        typeof (x as HiddenTheme).id === "string" &&
        typeof (x as HiddenTheme).title === "string" &&
        typeof (x as HiddenTheme).at === "number",
    );
  } catch {
    return [];
  }
}

// 追加(すでにあれば位置と時刻を更新)。新しいものを先頭に置き、上限を超えた分は末尾から落とす
export function withHidden(
  list: HiddenTheme[],
  theme: { id: string; title: string },
  now: number = Date.now(),
): HiddenTheme[] {
  const rest = list.filter((h) => h.id !== theme.id);
  return [{ id: theme.id, title: theme.title, at: now }, ...rest].slice(
    0,
    HIDDEN_THEMES_MAX,
  );
}

export function withoutHidden(list: HiddenTheme[], id: string): HiddenTheme[] {
  return list.filter((h) => h.id !== id);
}

// ---- ブラウザ側の読み書き ----

const EMPTY: HiddenTheme[] = [];

function readRaw(): string | null {
  try {
    return localStorage.getItem(HIDDEN_THEMES_KEY);
  } catch {
    return null; // プライベートモード等で localStorage が使えない環境
  }
}

// useSyncExternalStore のスナップショットは参照が安定している必要があるので、
// 生の文字列が変わったときだけ解析し直す
let cachedRaw: string | null | undefined;
let cachedList: HiddenTheme[] = EMPTY;
function getSnapshot(): HiddenTheme[] {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    const parsed = parseHiddenThemes(raw);
    cachedList = parsed.length === 0 ? EMPTY : parsed;
  }
  return cachedList;
}

function write(list: HiddenTheme[]) {
  try {
    if (list.length === 0) localStorage.removeItem(HIDDEN_THEMES_KEY);
    else localStorage.setItem(HIDDEN_THEMES_KEY, JSON.stringify(list));
  } catch {
    // 保存できない環境では何もしない(表示上も非表示にならないが、壊れはしない)
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange); // 別タブでの変更にも追従
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// 非表示リストの購読。サーバー描画とハイドレーション時は空(=全部表示)として扱い、
// クライアントで localStorage を読んだ時点で差し替わる
export function useHiddenThemes(): HiddenTheme[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

export function hideTheme(theme: { id: string; title: string }) {
  write(withHidden(getSnapshot(), theme));
}

export function unhideTheme(id: string) {
  write(withoutHidden(getSnapshot(), id));
}
