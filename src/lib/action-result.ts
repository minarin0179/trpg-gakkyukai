// Server Action の戻り値の型を2つに絞る。フォーム用(useActionState)は FormState、
// プログラム呼び出し用は ActionResult を使う。
// ActionResult を判別可能なユニオンにしておくと、成功時だけ data が読める形になり、
// 呼び出し側で ok の確認漏れと「エラー文言が無い失敗」の両方を型で防げる
export type FormState = { error?: string; done?: boolean };
export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };
