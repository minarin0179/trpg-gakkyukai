"use server";

import { and, count, eq, sql } from "drizzle-orm";
import { after } from "next/server";
import { db, themes, statements, votes } from "@/db";
import { revalidateTheme } from "@/lib/revalidate";
import { getOrCreateParticipantId, actorHash } from "@/lib/participant";
import { ipActor } from "@/lib/request";
import { checkAndRecordRate } from "@/lib/rate-limit";
import { maybeRecompute } from "@/lib/recompute";
import { findContentViolation } from "@/lib/content-filter";
import { isThemeId } from "@/lib/validate";
import type { ActionResult, FormState } from "@/lib/action-result";
import {
  STATEMENT_MAX,
  STATEMENT_GATE_VOTES,
  VOTE_IP_THEME_PER_STATEMENT,
  VOTE_IP_THEME_MIN,
  RATE_LIMITS,
} from "@/lib/config";

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
