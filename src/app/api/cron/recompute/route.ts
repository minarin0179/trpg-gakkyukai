import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, themes } from "@/db";
import { maybeRecompute } from "@/lib/recompute";

// 日次のバックストップ再計算。通常は投票時に都度再計算されるため、
// これは取りこぼし(計算失敗など)の回収用
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const active = await db
    .select({ id: themes.id })
    .from(themes)
    .where(eq(themes.status, "active"));

  let recomputed = 0;
  for (const t of active) {
    if (await maybeRecompute(t.id)) recomputed++;
  }
  return NextResponse.json({ themes: active.length, recomputed });
}
