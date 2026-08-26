import { cookies } from "next/headers";
import { randomUUID, createHash } from "crypto";
import { db, participants } from "@/db";

const COOKIE_NAME = "gk_pid";

// 匿名参加者ID。cookieがなければ発行し、DBに登録する。
// アカウントレス設計の唯一の識別子(本家Polisと同方式)。
export async function getOrCreateParticipantId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE_NAME)?.value;
  if (existing && /^[0-9a-f-]{36}$/.test(existing)) {
    return existing;
  }
  const id = randomUUID();
  await db.insert(participants).values({ id }).onConflictDoNothing();
  store.set(COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 400,
    path: "/",
  });
  return id;
}

export async function getParticipantId(): Promise<string | null> {
  const store = await cookies();
  const v = store.get(COOKIE_NAME)?.value;
  return v && /^[0-9a-f-]{36}$/.test(v) ? v : null;
}

// participantがDBに存在することを保証する(cookieだけ持っていてDB行がないケースの救済)
export async function ensureParticipant(id: string): Promise<void> {
  await db.insert(participants).values({ id }).onConflictDoNothing();
}

// レート制限・通報記録用のハッシュ。生IPや生cookie IDは保存しない
export function actorHash(value: string): string {
  const salt = process.env.HASH_SALT ?? "trpg-gakkyukai";
  return createHash("sha256").update(`${salt}:${value}`).digest("hex").slice(0, 32);
}

// IP用の日替わりハッシュ。ソルトに日付が入るため、日をまたぐと同一IPでも
// 別の値になり、長期的な追跡・突き合わせができない(実質IPを記憶しない設計)。
// レート制限の窓(24時間)の用途には十分
export function dailyActorHash(value: string): string {
  const day = new Date().toISOString().slice(0, 10);
  const salt = process.env.HASH_SALT ?? "trpg-gakkyukai";
  return createHash("sha256").update(`${salt}:${day}:${value}`).digest("hex").slice(0, 32);
}
