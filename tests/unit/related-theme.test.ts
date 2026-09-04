import test from "node:test";
import assert from "node:assert/strict";
import {
  RELATED_REASON_LABELS,
  RELATED_REASON_ORDER,
  pickPrimaryRelatedTheme,
  type RelatedReason,
  type RelatedTheme,
} from "@/lib/related-theme";

const themeOf = (reason: RelatedReason): RelatedTheme => ({
  id: `theme-${reason}`,
  title: `${reason}のテーマ`,
  voterCount: 10,
  statementCount: 5,
  reason,
});

test("1枠だけ出す画面は 関連 → 注目 → おまかせ の順に選ぶ", () => {
  assert.equal(
    pickPrimaryRelatedTheme([themeOf("random"), themeOf("trending"), themeOf("related")])?.reason,
    "related",
  );
  // 関連が無い(タグの重なりが1つも無い)テーマでは注目枠に落ちる
  assert.equal(
    pickPrimaryRelatedTheme([themeOf("random"), themeOf("trending")])?.reason,
    "trending",
  );
  assert.equal(pickPrimaryRelatedTheme([themeOf("random")])?.reason, "random");
});

test("候補が1件も無ければ null(UIは一覧への導線だけを出す)", () => {
  assert.equal(pickPrimaryRelatedTheme([]), null);
});

test("すべての枠に表示ラベルがある", () => {
  for (const reason of RELATED_REASON_ORDER) {
    assert.equal(typeof RELATED_REASON_LABELS[reason], "string");
    assert.ok(RELATED_REASON_LABELS[reason].length > 0);
  }
});
