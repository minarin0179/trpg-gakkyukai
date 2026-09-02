"use server";

import { and, cosineDistance, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidateTheme } from "@/lib/revalidate";
import { after } from "next/server";
import { getCache } from "@vercel/functions";
import { nanoid } from "nanoid";
import { db, themes, statements, votes, reports, themeTags } from "@/db";
import { getOrCreateParticipantId, actorHash } from "@/lib/participant";
import { ipActor } from "@/lib/request";
import { checkAndRecordRate } from "@/lib/rate-limit";
import { embedTexts } from "@/lib/embedding";
import { verifyTurnstile } from "@/lib/turnstile";
import { maybeRecompute } from "@/lib/recompute";
import { findContentViolation } from "@/lib/content-filter";
import { normalizeTag } from "@/lib/tags";
import { CONTACT_CATEGORIES } from "@/lib/contact";
import { notifyAdmin } from "@/lib/notify";
import { isThemeId, toIntId, REPORT_TARGET_ID_MAX } from "@/lib/validate";
import type { ActionResult, FormState } from "@/lib/action-result";
import {
  THEME_TITLE_MAX,
  THEME_DESCRIPTION_MAX,
  STATEMENT_MAX,
  SEED_STATEMENTS_MAX,
  VOTE_IP_THEME_PER_STATEMENT,
  VOTE_IP_THEME_MIN,
  THEME_SIMILAR_THRESHOLD,
  THEME_SIMILAR_MAX,
  STATEMENT_GATE_VOTES,
  TAGS_PER_THEME,
  CONTACT_BODY_MAX,
  CONTACT_REPLY_TO_MAX,
  RATE_LIMITS,
} from "@/lib/config";

// 型は action-result.ts が唯一の定義。移行中の呼び出し側のために再輸出する
export type { FormState };

// 埋め込みベクトルに意味の近いactiveテーマを返す(閾値以上のみ、上位N件)
async function similarThemesByVec(vec: number[]): Promise<{ id: string; title: string }[]> {
  const sim = sql<number>`1 - (${cosineDistance(themes.embedding, vec)})`;
  const near = await db
    .select({ id: themes.id, title: themes.title, sim })
    .from(themes)
    .where(and(eq(themes.status, "active"), isNotNull(themes.embedding)))
    .orderBy(desc(sim))
    .limit(THEME_SIMILAR_MAX);
  return near
    .filter((r) => Number(r.sim) >= THEME_SIMILAR_THRESHOLD)
    .map(({ id, title }) => ({ id, title }));
}

// テーマ提案フォームの入力中に呼ばれるライブチェック。
// 見つからない・チェックできない・レート超過はすべて空配列(UIは何も出さないだけ)
export async function findSimilarThemesAction(
  rawTitle: string,
): Promise<{ id: string; title: string }[]> {
  const title = String(rawTitle ?? "").trim();
  if (title.length < 5 || title.length > THEME_TITLE_MAX) return [];
  // 公開エンドポイント相当なので、埋め込み計算の乱用をIP単位で抑える
  const rate = await checkAndRecordRate("similar_check", await ipActor());
  if (!rate.ok) return [];
  const vec = (await embedTexts([title]))?.[0] ?? null;
  if (!vec) return [];
  return similarThemesByVec(vec);
}

export async function createThemeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const seedsRaw = String(formData.get("seeds") ?? "").trim();
  const turnstileToken = formData.get("cf-turnstile-response");

  if (title.length < 5 || title.length > THEME_TITLE_MAX) {
    return { error: `タイトルは5〜${THEME_TITLE_MAX}文字で入力してください` };
  }
  if (description.length > THEME_DESCRIPTION_MAX) {
    return { error: `説明は${THEME_DESCRIPTION_MAX}文字以内で入力してください` };
  }
  const seeds = seedsRaw
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (seeds.length < 2) {
    return { error: "最初の意見を2つ以上入れてください(1行に1つ)" };
  }
  if (seeds.length > SEED_STATEMENTS_MAX) {
    return { error: `最初の意見は${SEED_STATEMENTS_MAX}個までです` };
  }
  if (seeds.some((s) => s.length > STATEMENT_MAX)) {
    return { error: `意見は1つ${STATEMENT_MAX}文字以内で入力してください` };
  }

  for (const text of [title, description, ...seeds]) {
    const violation = findContentViolation(text);
    if (violation) return { error: violation };
  }

  // bot判定とレート制限を埋め込み計算(Python関数)より前に置き、
  // 無償で計算コストを発生させない
  if (!(await verifyTurnstile(typeof turnstileToken === "string" ? turnstileToken : null))) {
    return { error: "bot対策の確認に失敗しました。再読み込みして試してください" };
  }

  // 同一タイトルの重複は常に拒否(実データで同名テーマの並立が起きたため)。
  // レート制限より前に置き、差し戻しで枠を消費させない
  const exact = await db
    .select({ id: themes.id })
    .from(themes)
    .where(and(eq(themes.status, "active"), eq(themes.title, title)))
    .limit(1);
  if (exact.length > 0) {
    return { error: "同じタイトルのテーマがすでにあります。検索して参加してみてください" };
  }

  const participantId = await getOrCreateParticipantId();
  // cookieを消しても IP 側の制限が残るよう、両方で数える
  for (const actor of [actorHash(participantId), await ipActor()]) {
    const rate = await checkAndRecordRate("theme_create", actor);
    if (!rate.ok) {
      return {
        error: `テーマ提案は1日${RATE_LIMITS.theme_create.max}件までです。明日また提案してください`,
      };
    }
  }

  // 類似テーマは入力中のライブチェック(findSimilarThemesAction)で「表示」するのみ。
  // 送信時のゲート(差し戻して再送信させる)は設けない方針
  // (そこまで入力した時点で投稿意思は固まっており、止める意味が薄いため)。
  // 埋め込みは類似検出・意味検索用にテーマへ保存する
  const titleVec = (await embedTexts([title]))?.[0] ?? null;

  const id = nanoid(12);
  await db.insert(themes).values({
    id,
    title,
    description,
    proposerHash: actorHash(participantId),
    embedding: titleVec, // 取得失敗時はnull(以後の類似検出の対象から外れるだけ)
  });
  // 1行ずつではなく一括INSERTにする。往復回数を減らす(neon-httpは1クエリ=1往復)
  await db.insert(statements).values(seeds.map((text) => ({ themeId: id, text, participantId })));

  // タグ(任意)。カンマ区切りで受け取り、正規化して上限まで保存。
  // 不正なタグは黙って捨てる(テーマ公開自体は止めない)
  const tagsRaw = String(formData.get("tags") ?? "");
  const themeTagList = [...new Set(
    tagsRaw
      .split(",")
      .map((t) => normalizeTag(t).tag)
      .filter((t): t is string => !!t),
  )].slice(0, TAGS_PER_THEME);
  // こちらも一括INSERT。往復回数を減らす(neon-httpは1クエリ=1往復)
  if (themeTagList.length > 0) {
    await db
      .insert(themeTags)
      .values(themeTagList.map((tag) => ({ themeId: id, tag })))
      .onConflictDoNothing();
    // 新しいタグが語彙一覧に出るよう、タグ語彙のキャッシュも落とす
    await getCache()
      .expireTag("tag-vocab")
      .catch(() => {});
  }

  // 新テーマをテーマ一覧のRuntime Cache(60秒)を待たず即時反映する
  await getCache()
    .expireTag("themes-list")
    .catch(() => {});

  redirect(`/t/${id}`);
}

export async function createStatementAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const themeId = String(formData.get("themeId") ?? "");
  const text = String(formData.get("text") ?? "").trim();

  if (!isThemeId(themeId)) return { error: "不正なリクエストです" };
  if (text.length < 2 || text.length > STATEMENT_MAX) {
    return { error: `意見は2〜${STATEMENT_MAX}文字で入力してください` };
  }

  const violation = findContentViolation(text);
  if (violation) return { error: violation };

  // 投稿先テーマの存在と公開状態をここで確認する。
  // 未確認のままINSERTすると存在しないIDでFK違反になり、
  // 例外がerror.tsxに落ちてフォームのエラー表示にならないため
  const [targetTheme] = await db
    .select({ id: themes.id })
    .from(themes)
    .where(and(eq(themes.id, themeId), eq(themes.status, "active")))
    .limit(1);
  if (!targetTheme) return { error: "このテーマには投稿できません" };

  // 完全一致の重複は常に拒否。レート制限より前に置き、差し戻しで枠を消費させない
  const dup = await db
    .select({ id: statements.id })
    .from(statements)
    .where(
      and(
        eq(statements.themeId, themeId),
        eq(statements.status, "visible"),
        eq(statements.text, text),
      ),
    )
    .limit(1);
  if (dup.length > 0) {
    return { error: "同じ内容の意見がすでに投稿されています" };
  }

  const participantId = await getOrCreateParticipantId();

  // 投票ゲート: まずほかの意見に min(5, 意見数) 件投票してから投稿できる。
  // UI側(StatementForm)が同じ条件で先に案内するので、ここに来るのは
  // JS未動作か直接POSTのケース。レート制限より前に置き、枠を消費させない
  const [stmtCount] = await db
    .select({ n: count() })
    .from(statements)
    .where(and(eq(statements.themeId, themeId), eq(statements.status, "visible")));
  const required = Math.min(STATEMENT_GATE_VOTES, stmtCount?.n ?? 0);
  if (required > 0) {
    const [voted] = await db
      .select({ n: count() })
      .from(votes)
      .where(and(eq(votes.themeId, themeId), eq(votes.participantId, participantId)));
    if ((voted?.n ?? 0) < required) {
      return {
        error: `まずほかの意見に投票してみてください(あと${required - (voted?.n ?? 0)}件で投稿できます)`,
      };
    }
  }

  const rate = await checkAndRecordRate("statement_create", actorHash(participantId));
  if (!rate.ok) {
    return { error: `意見の投稿は1日${RATE_LIMITS.statement_create.max}件までです` };
  }
  // cookie再発行による回避を防ぐため、IP側(日替わりハッシュ)でも緩く計数する
  const ipRate = await checkAndRecordRate("statement_create_ip", await ipActor());
  if (!ipRate.ok) {
    return { error: "この回線からの投稿が多すぎます。時間を置いてください" };
  }

  await db.insert(statements).values({ themeId, text, participantId });
  revalidateTheme(themeId);
  return { done: true };
}

export async function castVoteAction(
  // themeIdはクライアント由来で信用できない。互換のため引数には残すが、
  // 実際のテーマは意見IDからDBで導出した値だけを使う
  _clientThemeId: string,
  statementId: number,
  value: number,
): Promise<ActionResult> {
  // UIからは起きない不正値。従来クライアント側で出していた文言をそのまま返す
  const invalid = { ok: false, error: "投票できませんでした。時間を置いて再読み込みしてください" } as const;
  if (![1, 0, -1].includes(value)) return invalid;
  if (!Number.isSafeInteger(statementId)) return invalid;

  // 投票はサイト内で最も呼ばれる経路なので往復数を切り詰める
  // (neon-httpは1クエリ=1往復):
  // 変更前 6回 = 意見の存在確認 + 意見数 + レート判定(count) + レート記録(insert)
  //   + participant補完 + 投票upsert (これに after 内の再計算判定が加わる)
  // 変更後 3回 = 存在確認と意見数を1クエリに + レート制限を1文に(rate-limit.ts)
  //   + participant補完と投票upsertを1文に (after 内の判定は据え置き)

  // 投票先のテーマは意見IDから導出する。クライアントの申告するthemeIdを信じると、
  // 別テーマ名義でIP×テーマのレート制限を素通りでき(枠が分散する)、
  // さらにテーマ横断の票がレポートの集計を汚染できてしまうため。
  // ついでに、非表示の意見・終了したテーマへの投票もここで弾く。
  // 投票上限の算出に使うテーマ内の意見数も、相関サブクエリで同時に取る
  const [target] = await db
    .select({
      themeId: statements.themeId,
      n: sql<number>`(select count(*) from ${statements} s2
        where s2.theme_id = ${statements.themeId} and s2.status = 'visible')::int`,
    })
    .from(statements)
    .innerJoin(themes, eq(themes.id, statements.themeId))
    .where(
      and(
        eq(statements.id, statementId),
        eq(statements.status, "visible"),
        eq(themes.status, "active"),
      ),
    )
    .limit(1);
  if (!target) return { ok: false, error: "この意見には投票できません" };
  const themeId = target.themeId;

  // 水増し対策: IP×テーマ単位のレート制限。Cookie側はリセットで逃れられる
  // (別参加者になり主キー制約ごと回避できる)ため設けない。
  // 上限は意見数に比例させ、人間の正規参加には届かない天井にする(config参照)
  const voteCap = Math.max(VOTE_IP_THEME_MIN, Number(target.n ?? 0) * VOTE_IP_THEME_PER_STATEMENT);
  const ipTheme = await ipActor(`theme:${themeId}`);
  const rate = await checkAndRecordRate("vote_ip_theme", ipTheme, voteCap, themeId);
  if (!rate.ok) {
    return { ok: false, error: "この回線からの投票が多すぎます。時間を置いてください" };
  }

  const participantId = await getOrCreateParticipantId();

  // participant行の補完(cookieだけ持っていてDB行がないケースの救済)と投票upsertを1文で。
  // WITH内のINSERTは参照されなくても必ず実行され、FK検査は文の最後に走るため、
  // 同じ文の中で先にparticipantsへ入れた行が votes のFKから見える
  await db.execute(sql`
    WITH p AS (INSERT INTO participants (id) VALUES (${participantId}) ON CONFLICT DO NOTHING)
    INSERT INTO votes (statement_id, participant_id, theme_id, value)
    VALUES (${statementId}, ${participantId}, ${themeId}, ${value})
    ON CONFLICT (statement_id, participant_id) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `);

  // レスポンスを返した後にバックグラウンドで再計算(必要な場合のみ)
  after(async () => {
    await maybeRecompute(themeId);
  });

  return { ok: true, data: undefined };
}

export async function submitReportAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const targetType = String(formData.get("targetType") ?? "");
  const targetId = String(formData.get("targetId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (targetType !== "theme" && targetType !== "statement" && targetType !== "tag") {
    return { error: "不正なリクエストです" };
  }
  // 対象IDの形式を種別ごとに確認する。管理ページ側は targetId をそのままIDとして
  // 使うため、ここで正規化しておかないと不正な文字列がキューに混ざる
  if (targetId.length > REPORT_TARGET_ID_MAX) return { error: "不正なリクエストです" };
  let normalizedTargetId: string;
  if (targetType === "theme") {
    if (!isThemeId(targetId)) return { error: "不正なリクエストです" };
    normalizedTargetId = targetId;
  } else {
    const intId = toIntId(targetId);
    if (intId === null) return { error: "不正なリクエストです" };
    normalizedTargetId = String(intId);
  }
  if (reason.length < 5 || reason.length > 500) {
    return { error: "通報理由は5〜500文字で入力してください" };
  }

  // 通報洪水で管理キューを埋める攻撃への速度制限
  const rate = await checkAndRecordRate("report_create", await ipActor());
  if (!rate.ok) {
    return { error: "通報が多すぎます。時間を置いてください" };
  }

  await db.insert(reports).values({
    targetType,
    targetId: normalizedTargetId,
    reason,
  });
  after(async () => {
    await notifyAdmin(
      `🔔 新しい通報が届きました(対象: ${targetType === "statement" ? "意見" : targetType === "tag" ? "タグ" : "テーマ"})。管理ページを確認してください`,
    );
  });
  return { done: true };
}

export async function submitContactAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const category = String(formData.get("category") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const replyTo = String(formData.get("replyTo") ?? "").trim();

  if (!(CONTACT_CATEGORIES as readonly string[]).includes(category)) {
    return { error: "カテゴリを選択してください" };
  }
  if (body.length < 5 || body.length > CONTACT_BODY_MAX) {
    return { error: `本文は5〜${CONTACT_BODY_MAX}文字で入力してください` };
  }
  if (replyTo.length > CONTACT_REPLY_TO_MAX) {
    return { error: `連絡先は${CONTACT_REPLY_TO_MAX}文字以内で入力してください` };
  }

  const rate = await checkAndRecordRate("report_create", await ipActor());
  if (!rate.ok) {
    return { error: "送信が多すぎます。時間を置いてください" };
  }

  const text = `【${category}】${body}`;
  await db.insert(reports).values({
    targetType: "contact",
    targetId: "-",
    reason: replyTo ? `${text}\n\n[連絡先] ${replyTo}` : text,
  });
  after(async () => {
    await notifyAdmin(`📮 新しいお問い合わせが届きました(${category})。管理ページを確認してください`);
  });
  return { done: true };
}

// テーマにタグを追加する(要望#4580)。誰でも追加可・削除は通報経由のみ。
export async function addThemeTagAction(
  themeId: string,
  rawTag: string,
): Promise<ActionResult<{ id?: number; tag: string }>> {
  if (!isThemeId(themeId)) return { ok: false, error: "不正なリクエストです" };
  const { tag, error } = normalizeTag(rawTag);
  // normalizeTagはtagが無いとき必ず理由を返すが、型上はundefinedを取り得る
  if (!tag) return { ok: false, error: error ?? "追加できませんでした" };

  const [theme] = await db
    .select({ status: themes.status })
    .from(themes)
    .where(eq(themes.id, themeId));
  if (!theme || theme.status !== "active") return { ok: false, error: "テーマが見つかりません" };

  const [{ n: tagCount }] = await db
    .select({ n: count() })
    .from(themeTags)
    .where(eq(themeTags.themeId, themeId));
  if (tagCount >= TAGS_PER_THEME) {
    return { ok: false, error: `タグは1テーマに${TAGS_PER_THEME}個までです` };
  }

  // 表記だけ違う同名タグ(大文字小文字)を弾く
  const [dup] = await db
    .select({ id: themeTags.id })
    .from(themeTags)
    .where(and(eq(themeTags.themeId, themeId), sql`lower(${themeTags.tag}) = lower(${tag})`))
    .limit(1);
  if (dup) return { ok: false, error: "同じタグがすでに付いています" };

  const participantId = await getOrCreateParticipantId();
  const rate = await checkAndRecordRate("tag_add", actorHash(participantId), undefined, themeId);
  if (!rate.ok) {
    return { ok: false, error: `タグの追加は1日${RATE_LIMITS.tag_add.max}回までです` };
  }
  const ipRate = await checkAndRecordRate("tag_add_ip", await ipActor(), undefined, themeId);
  if (!ipRate.ok) return { ok: false, error: "この回線からのタグ追加が多すぎます。時間を置いてください" };

  const [row] = await db
    .insert(themeTags)
    .values({ themeId, tag })
    .onConflictDoNothing()
    .returning({ id: themeTags.id });
  // タグ語彙・一覧カードのタグはRuntime Cacheに載っているので即時に無効化する
  await getCache()
    .expireTag("tag-vocab")
    .catch(() => {});
  // ページはISRキャッシュのため、表示の即時更新はクライアント側で行う
  // (revalidateThemeは他の閲覧者向けのキャッシュ更新)
  revalidateTheme(themeId);
  return { ok: true, data: { id: row?.id, tag } };
}
