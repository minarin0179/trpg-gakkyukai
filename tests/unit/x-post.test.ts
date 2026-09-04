import test from "node:test";
import assert from "node:assert/strict";
import {
  percentEncode,
  signatureBaseString,
  oauthSignature,
  authorizationHeader,
} from "@/lib/x-post";

// X(旧Twitter)の公式ドキュメント「Creating a signature」の例。
// 入力・署名ベース文字列・署名がすべて公開されているため、
// 自前のOAuth 1.0a実装がその通りの値を出すかを固定値で確かめられる
const EXAMPLE = {
  consumerKey: "xvz1evFS4wEEPTGEFPHBog",
  consumerSecret: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw",
  token: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb",
  tokenSecret: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE",
  url: "https://api.twitter.com/1.1/statuses/update.json",
  params: {
    status: "Hello Ladies + Gentlemen, a signed OAuth request!",
    include_entities: "true",
    oauth_consumer_key: "xvz1evFS4wEEPTGEFPHBog",
    oauth_nonce: "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg",
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: "1318622958",
    oauth_token: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb",
    oauth_version: "1.0",
  },
  base:
    "POST&https%3A%2F%2Fapi.twitter.com%2F1.1%2Fstatuses%2Fupdate.json&" +
    "include_entities%3Dtrue%26oauth_consumer_key%3Dxvz1evFS4wEEPTGEFPHBog%26" +
    "oauth_nonce%3DkYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg%26" +
    "oauth_signature_method%3DHMAC-SHA1%26oauth_timestamp%3D1318622958%26" +
    "oauth_token%3D370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb%26" +
    "oauth_version%3D1.0%26status%3DHello%2520Ladies%2520%252B%2520Gentlemen%252C%2520" +
    "a%2520signed%2520OAuth%2520request%2521",
  signature: "hCtSmYh+iHYCEqBWrE7C7hYmtUk=",
};

test("percentEncode は RFC 3986 の非予約文字だけを素通しする", () => {
  // encodeURIComponent が素通しする ! ' ( ) * も変換されること
  assert.equal(percentEncode("!'()*"), "%21%27%28%29%2A");
  assert.equal(percentEncode("-._~"), "-._~");
  assert.equal(percentEncode("a b+c"), "a%20b%2Bc");
  assert.equal(percentEncode("学級会"), "%E5%AD%A6%E7%B4%9A%E4%BC%9A");
});

test("署名ベース文字列が公式例と一致する", () => {
  assert.equal(signatureBaseString("POST", EXAMPLE.url, EXAMPLE.params), EXAMPLE.base);
});

test("署名ベース文字列はパラメータの順序に依存しない", () => {
  const shuffled = Object.fromEntries(Object.entries(EXAMPLE.params).reverse());
  assert.equal(signatureBaseString("post", EXAMPLE.url, shuffled), EXAMPLE.base);
});

test("HMAC-SHA1署名が公式例と一致する", () => {
  assert.equal(
    oauthSignature(EXAMPLE.base, EXAMPLE.consumerSecret, EXAMPLE.tokenSecret),
    EXAMPLE.signature,
  );
});

test("Authorizationヘッダは署名を含めてエンコードされる", () => {
  const header = authorizationHeader(EXAMPLE.params, EXAMPLE.signature);
  assert.ok(header.startsWith("OAuth "));
  // 署名の + と = はヘッダ内でもパーセントエンコードされる
  assert.ok(header.includes('oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"'));
  assert.ok(header.includes(`oauth_consumer_key="${EXAMPLE.consumerKey}"`));
  assert.ok(header.includes(`oauth_token="${EXAMPLE.token}"`));
});
