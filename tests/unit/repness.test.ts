import test from "node:test";
import assert from "node:assert/strict";
import { groupsLackingAgreeRepness } from "@/lib/repness";
import type { RepnessItem } from "@/lib/math-result";

const agree = (statement_id: number): RepnessItem => ({ statement_id, repful_for: "agree" });
const disagree = (statement_id: number): RepnessItem => ({
  statement_id,
  repful_for: "disagree",
});
const anyStatement = () => true;

test("最多グループの半分以下のグループを返す", () => {
  const repness = {
    "0": [agree(1), agree(2), agree(3), agree(4)],
    "1": [agree(5), agree(6)], // 4の半分ちょうど(=含む)
    "2": [agree(7)],
  };
  assert.deepEqual(groupsLackingAgreeRepness(repness, 3, anyStatement), [1, 2]);
});

test("どのグループにもagreeが無ければ空(データ不足は偏りとみなさない)", () => {
  assert.deepEqual(groupsLackingAgreeRepness({}, 3, anyStatement), []);
  assert.deepEqual(
    groupsLackingAgreeRepness({ "0": [disagree(1)], "1": [disagree(2)] }, 2, anyStatement),
    [],
  );
});

test("削除済みなど無効な意見は数えない", () => {
  const repness = { "0": [agree(1), agree(2)], "1": [agree(3), agree(99)] };
  // 99が無効になるとグループ1は1件=最多2件の半分以下になる
  assert.deepEqual(groupsLackingAgreeRepness(repness, 2, (id) => id !== 99), [1]);
  assert.deepEqual(groupsLackingAgreeRepness(repness, 2, anyStatement), []);
});

test("repnessに現れないグループも0件として扱う", () => {
  assert.deepEqual(groupsLackingAgreeRepness({ "0": [agree(1), agree(2)] }, 3, anyStatement), [
    1, 2,
  ]);
});
