"use server";

import { and, cosineDistance, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getCache } from "@vercel/functions";
import { nanoid } from "nanoid";
import { db, themes, statements, themeTags } from "@/db";
import { revalidateTheme } from "@/lib/revalidate";
import { getOrCreateParticipantId, actorHash } from "@/lib/participant";
import { ipActor } from "@/lib/request";
import { checkAndRecordRate } from "@/lib/rate-limit";
import { embedTexts } from "@/lib/embedding";
import { verifyTurnstile } from "@/lib/turnstile";
import { findContentViolation } from "@/lib/content-filter";
import { normalizeTag } from "@/lib/tags";
import { isThemeId } from "@/lib/validate";
import type { ActionResult, FormState } from "@/lib/action-result";
import {
  THEME_TITLE_MAX,
  THEME_DESCRIPTION_MAX,
  STATEMENT_MAX,
  SEED_STATEMENTS_MAX,
  THEME_SIMILAR_THRESHOLD,
  THEME_SIMILAR_MAX,
  TAGS_PER_THEME,
  RATE_LIMITS,
} from "@/lib/config";

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
