// node --test 用のモジュール解決フック。
//
// Node 24 は .ts の型を自前で剥がせるが、ESMの解決規則は厳密で
// 拡張子なしの相対import(`./config`)と `@/` エイリアスを解決できない。
// アプリ側のimportの書き方(=tsconfigのpaths)を変えずにテストしたいので、
// テスト実行時だけ tsc / バンドラと同じ解決をこのフックで補う。
import { existsSync } from "node:fs";
import { extname } from "node:path";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const SRC = new URL("../src/", import.meta.url);

function firstExisting(base) {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
    if (existsSync(fileURLToPath(candidate))) return candidate;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const isAlias = specifier.startsWith("@/");
    const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
    if ((isAlias || isRelative) && !extname(specifier)) {
      const base = isAlias
        ? new URL(specifier.slice(2), SRC).href
        : new URL(specifier, context.parentURL).href;
      const resolved = firstExisting(base);
      if (resolved) return nextResolve(resolved, context);
    }
    return nextResolve(specifier, context);
  },
});
