import { NextResponse } from "next/server";
import { eq, lt, isNotNull, sql, asc } from "drizzle-orm";
import { db, themes, rateEvents, reports } from "@/db";
import { maybeRecompute, recomputeTheme } from "@/lib/recompute";
import { safeEqual } from "@/lib/admin-auth";
import { RECOMPUTE_MIN_INTERVAL_SEC } from "@/lib/config";

// 再計算は1テーマにつき全票の読み込み+計算関数の往復がかかる。
// Vercelの関数上限まで使えるようにして、途中で打ち切られるのを防ぐ
export const maxDuration = 300;

// 同時に走らせる再計算の本数。計算関数(Python)とNeonへの負荷を抑えつつ、
// 直列より十分速くするための妥協点
const CONCURRENCY = 3;
// force時の1回あたりの処理件数(?limit=)。既定と上限
const FORCE_LIMIT_DEFAULT = 20;
const FORCE_LIMIT_MAX = 50;

// idの配列を CONCURRENCY 件ずつ処理し、再計算できた件数を返す。
// 1件の失敗で残りを止めないよう allSettled で受ける
async function runBounded(
  ids: string[],
  run: (id: string) => Promise<boolean>,
): Promise<number> {
  let recomputed = 0;
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const chunk = ids.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(chunk.map(run));
    results.forEach((r, j) => {
      if (r.status === "rejected") {
        console.error(`recompute failed for theme ${chunk[j]}:`, r.reason);
      } else if (r.value) {
        recomputed++;
      }
    });
  }
  return recomputed;
}

// 日次のバックストップ再計算。通常は投票時に都度再計算されるため、
// これは取りこぼし(計算失敗など)の回収用
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  // 秘密の突き合わせは長さ・内容の差が時間に出ない比較で行う
  if (!secret || !safeEqual(auth ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ?force=1 で、投票数の増減に関わらずアクティブテーマを再計算する。
  // 計算ロジック(_logic.py 等)を変更した後にキャッシュを一括更新する用途。
  const params = new URL(request.url).searchParams;
  const force = params.get("force") === "1";

  let targets: string[];
  let extra: { offset: number; limit: number; total: number; nextOffset: number | null } | null =
    null;

  if (force) {
    // 全件を一度に回すと関数の上限(300s)を超えるため、?offset= と ?limit= で
    // ページングし、運用側が nextOffset を辿って回し切る
    const offset = Math.max(0, Number(params.get("offset") ?? 0) || 0);
    const limit = Math.min(
      FORCE_LIMIT_MAX,
      Math.max(1, Number(params.get("limit") ?? FORCE_LIMIT_DEFAULT) || FORCE_LIMIT_DEFAULT),
    );
    const [{ n: total }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(themes)
      .where(eq(themes.status, "active"));
    const rows = await db
      .select({ id: themes.id })
      .from(themes)
      .where(eq(themes.status, "active"))
      .orderBy(asc(themes.id))
      .limit(limit)
      .offset(offset);
    targets = rows.map((r) => r.id);
    extra = {
      offset,
      limit,
      total,
      nextOffset: offset + rows.length < total ? offset + rows.length : null,
    };
  } else {
    // 再計算が要るテーマだけを1クエリで絞り込む。テーマごとに
    // 「計算結果の有無」「最終投票時刻」を引くとテーマ数×2往復になるため
    // (neon-httpは1クエリ=1往復)、条件をSQL側に寄せる。
    // 条件: 計算結果がまだ無い、または前回計算以降に投票が動いていて
    // かつ前回計算から最短間隔(RECOMPUTE_MIN_INTERVAL_SEC)が経っている
    const { rows } = await db.execute<{ id: string }>(sql`
      select t.id
      from themes t
      left join math_results m on m.theme_id = t.id
      where t.status = 'active'
        and (
          m.theme_id is null
          or (
            (select max(v.updated_at) from votes v where v.theme_id = t.id) > m.computed_at
            and m.computed_at < now() - make_interval(secs => ${RECOMPUTE_MIN_INTERVAL_SEC}::double precision)
          )
        )
      order by t.id
    `);
    targets = rows.map((r) => r.id);
  }

  // maybeRecompute は内部でもう一度安く条件を確認する(その間に投票時の
  // 再計算が走っていた場合の二重実行を避ける)ので、そのまま呼んでよい
  const recomputed = force
    ? await runBounded(targets, async (id) => {
        await recomputeTheme(id);
        return true;
      })
    : await runBounded(targets, (id) => maybeRecompute(id));

  // レート制限の窓(24時間)を過ぎた記録は二度と読まれないので24時間で消し込む。
  // 日次cronでの実行なので実際の残存は最大48時間(プライバシーページの記載どおり)。
  // ハッシュは日替わりソルトのため、残存中も日をまたげば突き合わせ不能
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await db.delete(rateEvents).where(lt(rateEvents.createdAt, cutoff));
  // 通報のIP記録は廃止済み。過去に保存された分を消し込む
  await db.update(reports).set({ ipHash: null }).where(isNotNull(reports.ipHash));

  // themes は「この実行で対象にしたテーマ数」
  return NextResponse.json({ themes: targets.length, recomputed, ...(extra ?? {}) });
}
