import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--headless=new"] });
const page = await browser.newPage({
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
});
await page.goto("https://trpg-gakkyukai.com/new", { waitUntil: "networkidle" });
for (let i = 0; i < 15; i++) {
  await page.waitForTimeout(2000);
  const token = await page.inputValue('input[name="cf-turnstile-response"]').catch(() => "");
  if (token && token.length > 20) {
    console.log("TOKEN_OBTAINED", token.length);
    console.log(token);
    break;
  }
  // インタラクティブチャレンジが出ていたらiframe内のチェックボックスを試す
  const frame = page.frames().find((f) => f.url().includes("challenges.cloudflare.com"));
  if (frame) {
    await frame.click('input[type="checkbox"], .cb-lb', { timeout: 1000 }).catch(() => {});
  }
}
await browser.close();
