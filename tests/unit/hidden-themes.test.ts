import test from "node:test";
import assert from "node:assert/strict";
import {
  parseHiddenThemes,
  withHidden,
  withoutHidden,
  HIDDEN_THEMES_MAX,
} from "@/lib/hidden-themes";

test("parseHiddenThemes: 壊れた値や型の違う要素は捨てる", () => {
  assert.deepEqual(parseHiddenThemes(null), []);
  assert.deepEqual(parseHiddenThemes("not json"), []);
  assert.deepEqual(parseHiddenThemes('{"id":"x"}'), []);
  const ok = { id: "abc", title: "テーマ", at: 1 };
  assert.deepEqual(
    parseHiddenThemes(
      JSON.stringify([ok, { id: 1 }, null, { id: "b", title: "c" }]),
    ),
    [ok],
  );
});

test("withHidden: 先頭に追加し、同じidは1つにまとめ、上限で古いものを落とす", () => {
  const a = withHidden([], { id: "a", title: "A" }, 1);
  const b = withHidden(a, { id: "b", title: "B" }, 2);
  assert.deepEqual(
    b.map((h) => h.id),
    ["b", "a"],
  );
  // 再度 a を隠すと先頭に移動し、タイトルと時刻が更新される
  const again = withHidden(b, { id: "a", title: "A2" }, 3);
  assert.deepEqual(again, [
    { id: "a", title: "A2", at: 3 },
    { id: "b", title: "B", at: 2 },
  ]);
  // 上限
  let list = again;
  for (let i = 0; i < HIDDEN_THEMES_MAX + 5; i++) {
    list = withHidden(list, { id: `t${i}`, title: `T${i}` }, 10 + i);
  }
  assert.equal(list.length, HIDDEN_THEMES_MAX);
  assert.equal(list[0].id, `t${HIDDEN_THEMES_MAX + 4}`);
  assert.ok(!list.some((h) => h.id === "a")); // いちばん古いものは落ちている
});

test("withoutHidden: idで取り除き、無ければそのまま", () => {
  const list = [
    { id: "a", title: "A", at: 1 },
    { id: "b", title: "B", at: 2 },
  ];
  assert.deepEqual(withoutHidden(list, "a"), [list[1]]);
  assert.deepEqual(withoutHidden(list, "zzz"), list);
});
