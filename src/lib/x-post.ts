import { createHmac, randomBytes } from "node:crypto";
import { xCredentials } from "./env";

// X(旧Twitter)API v2 への投稿。週間ダイジェストの告知に使う。
// OAuth 1.0a(HMAC-SHA1・ユーザーコンテキスト)は node:crypto だけで書けるので、
// 依存パッケージは足さない(この1機能のために署名ライブラリを入れるとバンドルと
// 供給網の両方が重くなる)。
// 秘密(API secret / access token secret)は例外メッセージにもログにも出さない。

const ENDPOINT = "https://api.x.com/2/tweets";

// 資格情報が4つ揃っているか。未設定の環境では投稿を試みずに下書きだけ残す
export function isXConfigured(): boolean {
  return xCredentials() !== undefined;
}

// RFC 3986 のパーセントエンコード。encodeURIComponent は
// ! ' ( ) * を素通しするため、OAuth の要求どおり明示的に変換する
export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

// 署名ベース文字列。パラメータはエンコード後のキー(同値ならエンコード後の値)で
// 辞書順に並べる。本文が JSON の場合、本文は署名に含めない(仕様どおり、
// 署名対象は URL のクエリと oauth_* だけ)
export function signatureBaseString(
  method: string,
  url: string,
  params: Record<string, string>,
): string {
  const pairs = Object.entries(params)
    .map(([k, v]) => [percentEncode(k), percentEncode(v)] as const)
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));
  const paramString = pairs.map(([k, v]) => `${k}=${v}`).join("&");
  return [method.toUpperCase(), percentEncode(url), percentEncode(paramString)].join("&");
}

// 署名鍵は「エンコード済みconsumer secret & エンコード済みtoken secret」。
// token secret が無い(リクエストトークン取得前)場合も & は必ず入れる
export function oauthSignature(
  baseString: string,
  consumerSecret: string,
  tokenSecret: string,
): string {
  const key = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  return createHmac("sha1", key).update(baseString).digest("base64");
}

// Authorization ヘッダの組み立て。oauth_signature を含めた全パラメータを
// key="value" 形式(値はパーセントエンコード)で並べる
export function authorizationHeader(params: Record<string, string>, signature: string): string {
  const all = { ...params, oauth_signature: signature };
  const parts = Object.entries(all)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`);
  return `OAuth ${parts.join(", ")}`;
}

// 実際の投稿。2xx 以外は応答本文を添えて例外にする(呼び出し側が
// postError として保存し、管理画面で原因を読めるようにするため)
export async function postToX(text: string): Promise<{ id: string }> {
  const cred = xCredentials();
  if (!cred) throw new Error("Xの資格情報が設定されていません");

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: cred.apiKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: cred.accessToken,
    oauth_version: "1.0",
  };
  const signature = oauthSignature(
    signatureBaseString("POST", ENDPOINT, oauthParams),
    cred.apiSecret,
    cred.accessTokenSecret,
  );

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: authorizationHeader(oauthParams, signature),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`X API ${res.status}: ${body.slice(0, 500)}`);
  }
  const data = JSON.parse(body) as { data?: { id?: string } };
  const id = data.data?.id;
  if (!id) throw new Error(`X API: 応答に投稿IDがありません: ${body.slice(0, 200)}`);
  return { id };
}
