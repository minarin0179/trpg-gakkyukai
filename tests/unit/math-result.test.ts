import test from "node:test";
import assert from "node:assert/strict";
import { isMathResultJson, toMapPayload, toPublicMathResult } from "@/lib/math-result";

const good = {
  status: "ok",
  reason: "内部事情",
  group_count: 2,
  participants: [{ id: 1, x: 0.1, y: -0.2, cluster: 0 }],
  consensus: { agree: [], disagree: [] },
  repness: { "0": [{ statement_id: 3, repful_for: "agree" }] },
  statement_priorities: { "3": 5.06 },
  projection: { n_statements: 4, statements: { "3": [0.1, 0.2, 0.3] } },
  pidMap: { "uuid-1": 1 },
};

test("正しい形は通る", () => {
  assert.equal(isMathResultJson(good), true);
  assert.equal(isMathResultJson({ status: "insufficient" }), true);
});

test("statusが不正・座標が数値でない場合は弾く", () => {
  assert.equal(isMathResultJson({ status: "pending" }), false);
  assert.equal(isMathResultJson({ ...good, participants: [{ id: 1, x: "0.1", y: 0.2 }] }), false);
  assert.equal(isMathResultJson({ ...good, participants: {} }), false);
  assert.equal(isMathResultJson({ ...good, projection: { statements: {} } }), false);
  assert.equal(isMathResultJson(null), false);
  assert.equal(isMathResultJson([good]), false);
});

test("toPublicMathResult は pidMap と reason を落とす", () => {
  const pub = toPublicMathResult(good);
  assert.ok(pub);
  // pidMapは参加者UUIDそのもの。クライアントへ出ないことがこのテストの主眼
  assert.equal("pidMap" in pub, false);
  assert.equal("reason" in pub, false);
  assert.equal(pub.group_count, 2);
  // 元のオブジェクトは壊さない(呼び出し側がサーバー内部で使い続けるため)
  assert.ok("pidMap" in good);
});

test("形が想定外なら null(=マップを出さない)", () => {
  assert.equal(toPublicMathResult({ status: "broken" }), null);
});

test("toMapPayload は点をタプル化し、並びと欠番idを保つ", () => {
  const pub = toPublicMathResult({
    ...good,
    // participants には欠番があり得る(可視の意見に1票も無い参加者は落ちる)。
    // /me の myIndex は行列インデックスなので、idを落とすと自分の点を見失う
    participants: [
      { id: 0, x: 0.1, y: -0.2, cluster: 0 },
      { id: 2, x: 0.3, y: 0.4, cluster: null },
    ],
  })!;
  const payload = toMapPayload(pub);
  assert.deepEqual(payload.pts, [
    [0.1, -0.2, 0, 0],
    [0.3, 0.4, null, 2],
  ]);
  assert.equal(payload.groupCount, 2);
  assert.deepEqual(payload.statementPriorities, { "3": 5.06 });
});

test("status が ok でなければ点は空(=マップを描かない)", () => {
  assert.deepEqual(toMapPayload({ status: "insufficient" }).pts, []);
});
