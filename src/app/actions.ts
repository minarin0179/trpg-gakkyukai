"use server";

import { and, cosineDistance, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { headers } from "next/headers";
import { getCache } from "@vercel/functions";
import { nanoid } from "nanoid";
import { db, themes, statements, votes, reports } from "@/db";
import {
  getOrCreateParticipantId,
  ensureParticipant,
  actorHash,
  dailyActorHash,
} from "@/lib/participant";
import { checkAndRecordRate } from "@/lib/rate-limit";
import { embedTexts } from "@/lib/embedding";
import { verifyTurnstile } from "@/lib/turnstile";
import { maybeRecompute } from "@/lib/recompute";
import { findContentViolation } from "@/lib/content-filter";
import { CONTACT_CATEGORIES } from "@/lib/contact";
import { notifyAdmin } from "@/lib/notify";
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
} from "@/lib/config";

export type FormState = {
  error?: string;
  done?: boolean;
  // 類似テーマの確認表示(テーマ提案の1回目の送信で類似が見つかったとき)
  similar?: { id: string; title: string }[];
};

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

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
  const rate = await checkAndRecordRate("similar_check", dailyActorHash(`ip:${await clientIp()}`));
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

  // 同一タイトルの重複は常に拒否(実データで同名テーマの並立が起きたため)
  const exact = await db
    .select({ id: themes.id })
    .from(themes)
    .where(and(eq(themes.status, "active"), eq(themes.title, title)))
    .limit(1);
  if (exact.length > 0) {
    return { error: "同じタイトルのテーマがすでにあります。検索して参加してみてください" };
  }

  // 類似テーマの確認(初回送信時のみ)。通常は入力中のライブチェック
  // (findSimilarThemesAction)が先に知らせて confirmSimilar=1 になっているため、
  // ここで差し戻るのはJS未動作やライブチェック失敗時のフォールバック。
  // 埋め込みが取れないときはスキップして通す(補助機能が投稿を止めない)。
  // Turnstile検証より前に置くのは、トークンを消費せずに差し戻すため
  const titleVec = (await embedTexts([title]))?.[0] ?? null;
  if (formData.get("confirmSimilar") !== "1" && titleVec) {
    const similar = await similarThemesByVec(titleVec);
    if (similar.length > 0) {
      return { similar };
    }
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
    embedding: titleVec, // 取得失敗時はnull(以後の類似検出の対象から外れるだけ)
  });
  for (const text of seeds) {
    await db.insert(statements).values({ themeId: id, text, participantId });
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

  if (!themeId) return { error: "不正なリクエストです" };
  if (text.length < 2 || text.length > STATEMENT_MAX) {
    return { error: `意見は2〜${STATEMENT_MAX}文字で入力してください` };
  }

  const violation = findContentViolation(text);
  if (violation) return { error: violation };

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

  await db.insert(statements).values({ themeId, text, participantId });
  revalidatePath(`/t/${themeId}`);
  return { done: true };
}

export async function castVoteAction(
  themeId: string,
  statementId: number,
  value: number,
): Promise<{ ok: boolean; error?: string }> {
  if (![1, 0, -1].includes(value)) return { ok: false };

  // 水増し対策: IP×テーマ単位のレート制限。Cookie側はリセットで逃れられる
  // (別参加者になり主キー制約ごと回避できる)ため設けない。
  // 上限は意見数に比例させ、人間の正規参加には届かない天井にする(config参照)
  const [stmtCount] = await db
    .select({ n: count() })
    .from(statements)
    .where(and(eq(statements.themeId, themeId), eq(statements.status, "visible")));
  const voteCap = Math.max(VOTE_IP_THEME_MIN, (stmtCount?.n ?? 0) * VOTE_IP_THEME_PER_STATEMENT);
  const ipTheme = dailyActorHash(`ip:${await clientIp()}:theme:${themeId}`);
  const rate = await checkAndRecordRate("vote_ip_theme", ipTheme, voteCap, themeId);
  if (!rate.ok) {
    return { ok: false, error: "この回線からの投票が多すぎます。時間を置いてください" };
  }

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
  after(async () => {
    await notifyAdmin(
      `🔔 新しい通報が届きました(対象: ${targetType === "statement" ? "意見" : "テーマ"})。管理ページを確認してください`,
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
