import { headers } from "next/headers";
import { dailyActorHash } from "@/lib/participant";

// リクエスト元のIP。Vercelのプロキシ経由なので x-forwarded-for の先頭ホップ
// (クライアントに最も近い側)を採る。取れない場合は "unknown" に寄せて、
// レート制限の集計対象から漏れないようにする
export async function getClientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

// レート制限のIP側アクター。生IPではなく日替わりハッシュにするのは、
// 日をまたぐと同じIPでも別の値になり長期の追跡ができないため
// (実質IPを記憶しない設計。participant.ts の dailyActorHash 参照)。
// scope を渡すとIP×スコープ(例: テーマ単位)で枠を分ける
export async function ipActor(scope?: string): Promise<string> {
  const ip = await getClientIp();
  return dailyActorHash(scope ? `ip:${ip}:${scope}` : `ip:${ip}`);
}
