import { cookies } from "next/headers";
import { randomUUID, createHash } from "crypto";
import { db, participants } from "@/db";
import { hashSalt } from "./env";
import { PARTICIPANT_COOKIE_MAX_AGE_SEC } from "./config";

const COOKIE_NAME = "gk_pid";
// 「参加済み」の目印(値に意味はない)。本体のgk_pidはhttpOnlyでクライアントから
// 見えないため、個人化API(/api/t/[id]/me)を呼ぶ必要があるかの判定に使う。
// 未参加の閲覧者(大半)が空応答のためだけにAPIを叩くのを避ける
const MARKER_COOKIE = "gk_p";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

function setMarkerCookie(store: CookieStore): void {
  store.set(MARKER_COOKIE, "1", {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: PARTICIPANT_COOKIE_MAX_AGE_SEC,
    path: "/",
  });
}

// 匿名参加者ID。cookieがなければ発行し、DBに登録する。
// アカウントレス設計の唯一の識別子(本家Polisと同方式)。
export async function getOrCreateParticipantId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE_NAME)?.value;
  if (existing && /^[0-9a-f-]{36}$/.test(existing)) {
    // 目印が無い既存参加者(目印導入前からの利用者)にもここで補う
    if (!store.get(MARKER_COOKIE)) setMarkerCookie(store);
    return existing;
  }
  const id = randomUUID();
  await db.insert(participants).values({ id }).onConflictDoNothing();
  store.set(COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: PARTICIPANT_COOKIE_MAX_AGE_SEC,
    path: "/",
  });
  setMarkerCookie(store);
  return id;
}

export async function getParticipantId(): Promise<string | null> {
  const store = await cookies();
  const v = store.get(COOKIE_NAME)?.value;
  return v && /^[0-9a-f-]{36}$/.test(v) ? v : null;
}

// レート制限・通報記録用のハッシュ。生IPや生cookie IDは保存しない
export function actorHash(value: string): string {
  const salt = hashSalt();
  return createHash("sha256").update(`${salt}:${value}`).digest("hex").slice(0, 32);
}

// IP用の日替わりハッシュ。ソルトに日付が入るため、日をまたぐと同一IPでも
// 別の値になり、長期的な追跡・突き合わせができない(実質IPを記憶しない設計)。
// レート制限の窓(24時間)の用途には十分
export function dailyActorHash(value: string): string {
  const day = new Date().toISOString().slice(0, 10);
  const salt = hashSalt();
  return createHash("sha256").update(`${salt}:${day}:${value}`).digest("hex").slice(0, 32);
}
