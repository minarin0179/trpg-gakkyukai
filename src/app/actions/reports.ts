"use server";

import { after } from "next/server";
import { db, reports } from "@/db";
import { ipActor } from "@/lib/request";
import { checkAndRecordRate } from "@/lib/rate-limit";
import { CONTACT_CATEGORIES } from "@/lib/contact";
import { notifyAdmin } from "@/lib/notify";
import { isThemeId, toIntId, REPORT_TARGET_ID_MAX } from "@/lib/validate";
import type { FormState } from "@/lib/action-result";
import { CONTACT_BODY_MAX, CONTACT_REPLY_TO_MAX } from "@/lib/config";

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

  // 連絡先は本文に混ぜず専用列に入れる(対応後に本文を残したまま消せるようにする)
  await db.insert(reports).values({
    targetType: "contact",
    targetId: "-",
    reason: `【${category}】${body}`,
    replyTo: replyTo || null,
  });
  after(async () => {
    await notifyAdmin(`📮 新しいお問い合わせが届きました(${category})。管理ページを確認してください`);
  });
  return { done: true };
}
