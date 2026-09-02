import test from "node:test";
import assert from "node:assert/strict";
import { weightedShuffle, DEFAULT_PRIORITY } from "@/lib/weighted-shuffle";

// 再現可能な擬似乱数(mulberry32)。本番は Math.random が既定
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const items = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, text: `意見${i + 1}` }));
const ids = (list: { id: number }[]) => list.map((s) => s.id);

test("同じ入力と同じ乱数なら同じ順序", () => {
  const priorities = { "1": 10, "2": 5 };
  const a = weightedShuffle(items, priorities, seeded(1));
  const b = weightedShuffle(items, priorities, seeded(1));
  assert.deepEqual(ids(a), ids(b));
  // 乱数が違えば順序は変わり得る(全員が同一順で見る偏りを避けるのが目的)
  assert.notDeepEqual(ids(a), ids(weightedShuffle(items, priorities, seeded(2))));
});

test("出力は入力の並べ替え(欠落・重複なし)", () => {
  const cases: (Record<string, number> | null)[] = [null, {}, { "3": 100 }];
  for (const priorities of cases) {
    const out = weightedShuffle(items, priorities, seeded(7));
    assert.equal(out.length, items.length);
    assert.deepEqual([...ids(out)].sort((x, y) => x - y), ids(items));
  }
});

test("priorityが高い意見ほど前に出やすい", () => {
  // 1件だけ極端に高い重みを与え、多数回の平均順位が明確に前になることを見る
  const priorities = { "1": 1000 };
  let firstCount = 0;
  const trials = 300;
  for (let seed = 0; seed < trials; seed++) {
    const out = weightedShuffle(items, priorities, seeded(seed));
    if (out[0].id === 1) firstCount++;
  }
  // 期待値は 1000/(1000+7×5.06) ≈ 96.6%。ゆらぎを見込んで8割で判定する
  assert.ok(firstCount / trials > 0.8, `先頭になった割合: ${firstCount / trials}`);
});

test("priorityが無い意見には既定値が使われる", () => {
  // 既定値と同じ重みを明示した場合と結果が一致する(=未指定は DEFAULT_PRIORITY 扱い)
  const explicit = Object.fromEntries(items.map((s) => [String(s.id), DEFAULT_PRIORITY]));
  assert.deepEqual(
    ids(weightedShuffle(items, {}, seeded(3))),
    ids(weightedShuffle(items, explicit, seeded(3))),
  );
});

test("priorities が null なら一様シャッフル", () => {
  const out = weightedShuffle(items, null, seeded(5));
  assert.deepEqual([...ids(out)].sort((x, y) => x - y), ids(items));
});
