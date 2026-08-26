// ページのスクリーンショットを撮る開発用スクリプト。
// 使い方: node scripts/screenshot.mjs <url> <出力先.png> [幅] [高さ] [--full]
import { chromium } from "playwright";

const [url, out, w = "1280", h = "800", full] = process.argv.slice(2);
if (!url || !out) {
  console.error("usage: node scripts/screenshot.mjs <url> <out.png> [width] [height] [--full]");
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
// スクロール連動アニメーション(view())はフルページ撮影と相性が悪いので、
// reduced-motionをエミュレートして演出なしの最終状態を撮る
await page.emulateMedia({ reducedMotion: "reduce" });
await page.goto(url, { waitUntil: "load" });
// networkidleはTurnstileやAI可用性チェック等の常駐通信で永遠に来ないことがあるため、
// loadの後に短い猶予を置く方式にする
await page.waitForTimeout(1500);
await page.screenshot({ path: out, fullPage: full === "--full" });
await browser.close();
console.log(`saved: ${out}`);
