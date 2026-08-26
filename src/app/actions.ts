"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { headers } from "next/headers";
import { nanoid } from "nanoid";
import { db, themes, statements, votes, reports } from "@/db";
import {
  getOrCreateParticipantId,
  ensureParticipant,
  actorHash,
  dailyActorHash,
} from "@/lib/participant";
import { checkAndRecordRate } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { maybeRecompute } from "@/lib/recompute";
import { findContentViolation } from "@/lib/content-filter";
import {
  THEME_TITLE_MAX,
  THEME_DESCRIPTION_MAX,
  STATEMENT_MAX,
  SEED_STATEMENTS_MAX,
} from "@/lib/config";

export type FormState = { error?: string; done?: boolean };

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
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

  if (!(await verifyTurnstile(typeof turnstileToken === "string" ? turnstileToken : null))) {
    return { error: "bot対策の確認に失敗しました。再読み込みして試してください" };
  }

  const participantId = await getOrCreateParticipantId();
  const ip = await clientIp();
  // cookieを消しても IP 側の制限が残るよう、両方で数える
  for (const actor of [actorHash(participantId), dailyActorHash(`ip:${ip}`)]) {
    const rate = await checkAndRecordRate("theme_create", actor);
    if (!rate.ok) {
      return { error: "テーマ提案は1日3件までです。明日また提案してください" };
    }
  }

  const id = nanoid(12);
  await db.insert(themes).values({
    id,
    title,
    description,
    proposerHash: actorHash(participantId),
  });
  for (const text of seeds) {
    await db.insert(statements).values({ themeId: id, text, participantId });
  }

  redirect(`/t/${id}`);
}

export async function createStatementAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const themeId = String(formData.get("themeId") ?? "");
  const text = String(formData.get("text") ?? "").trim();

  if (!themeId) return { error: "不正なリクエストです" };
  if (text.length < 2 || text.length > STATEMENT_MAX) {
    return { error: `意見は2〜${STATEMENT_MAX}文字で入力してください` };
  }

  const violation = findContentViolation(text);
  if (violation) return { error: violation };

  const participantId = await getOrCreateParticipantId();
  const rate = await checkAndRecordRate("statement_create", actorHash(participantId));
  if (!rate.ok) {
    return { error: "意見の投稿は1日30件までです" };
  }
  // cookie再発行による回避を防ぐため、IP側(日替わりハッシュ)でも緩く計数する
  const ipRate = await checkAndRecordRate(
    "statement_create_ip",
    dailyActorHash(`ip:${await clientIp()}`),
  );
  if (!ipRate.ok) {
    return { error: "この回線からの投稿が多すぎます。時間を置いてください" };
  }

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

  await db.insert(statements).values({ themeId, text, participantId });
  revalidatePath(`/t/${themeId}`);
  return { done: true };
}

export async function castVoteAction(
  themeId: string,
  statementId: number,
  value: number,
): Promise<{ ok: boolean }> {
  if (![1, 0, -1].includes(value)) return { ok: false };
  const participantId = await getOrCreateParticipantId();
  await ensureParticipant(participantId);

  await db
    .insert(votes)
    .values({ themeId, statementId, participantId, value })
    .onConflictDoUpdate({
      target: [votes.statementId, votes.participantId],
      set: { value, updatedAt: new Date() },
    });

  // レスポンスを返した後にバックグラウンドで再計算(必要な場合のみ)
  after(async () => {
    await maybeRecompute(themeId);
  });

  return { ok: true };
}

export async function submitReportAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const targetType = String(formData.get("targetType") ?? "");
  const targetId = String(formData.get("targetId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (targetType !== "theme" && targetType !== "statement") {
    return { error: "不正なリクエストです" };
  }
  if (reason.length < 5 || reason.length > 500) {
    return { error: "通報理由は5〜500文字で入力してください" };
  }

  // 通報洪水で管理キューを埋める攻撃への速度制限
  const rate = await checkAndRecordRate(
    "report_create",
    dailyActorHash(`ip:${await clientIp()}`),
  );
  if (!rate.ok) {
    return { error: "通報が多すぎます。時間を置いてください" };
  }

  await db.insert(reports).values({
    targetType,
    targetId,
    reason,
  });
  return { done: true };
}

export async function submitContactAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const body = String(formData.get("body") ?? "").trim();
  const replyTo = String(formData.get("replyTo") ?? "").trim();

  if (body.length < 5 || body.length > 2000) {
    return { error: "本文は5〜2000文字で入力してください" };
  }
  if (replyTo.length > 200) {
    return { error: "連絡先は200文字以内で入力してください" };
  }

  const rate = await checkAndRecordRate(
    "report_create",
    dailyActorHash(`ip:${await clientIp()}`),
  );
  if (!rate.ok) {
    return { error: "送信が多すぎます。時間を置いてください" };
  }

  await db.insert(reports).values({
    targetType: "contact",
    targetId: "-",
    reason: replyTo ? `${body}\n\n[連絡先] ${replyTo}` : body,
  });
  return { done: true };
}
