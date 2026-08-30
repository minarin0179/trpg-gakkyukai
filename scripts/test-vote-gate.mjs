// 投票ゲート(min(5,意見数)件投票するまで意見投稿不可)のE2Eテスト。
// テストブランチDB+localhost:3100前提。シードテーマ(8意見)を対象にする。
import { chromium } from "playwright";

const BASE = "http://localhost:3100";
const THEME = process.env.THEME_ID;

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });

try {
  await page.goto(`${BASE}/t/${THEME}`, { waitUntil: "load" });
  await page.getByText(/意見 1 \/ 8/).waitFor({ timeout: 20000 });

  // ① 未投票でヘッダーを押すと、展開されず案内だけが出る
  await page.getByText("意見を投稿する").click();
  await page.getByText(/あと5件投票すると、意見を投稿できます\(0\/5\)/).waitFor({ timeout: 20000 });
  check("未投票では案内表示(0/5)", true);
  check("投稿欄が展開されない", !(await page.locator('textarea[name="text"]').isVisible()));
  check(
    "ガイドラインも展開されない",
    !(await page.getByText("伝わる意見の書き方").isVisible()),
  );

  // ② デッキで5件投票するとゲートが解除され、普通に開けるようになる
  const agree = page.locator("button.bg-emerald-600.py-2\\.5");
  for (let i = 1; i <= 5; i++) {
    await agree.click();
    await page.getByText(new RegExp(`意見 ${i + 1} / 8`)).waitFor({ timeout: 20000 });
  }
  await page.getByText("意見を投稿する").click();
  await page.locator('textarea[name="text"]').waitFor({ timeout: 20000 });
  check("5件投票後は普通に展開される", true);

  // ③ 投稿できる
  await page.fill('textarea[name="text"]', "投票ゲートのテスト投稿です");
  await page.getByRole("button", { name: "意見を投稿" }).click();
  await page.getByText("投稿しました").waitFor({ timeout: 20000 });
  check("解除後は投稿できる", true);
} catch (e) {
  check(`例外: ${e.message?.slice(0, 200)}`, false);
} finally {
  await browser.close();
}

const fails = results.filter((r) => !r.ok).length;
console.log(fails === 0 ? "ALL PASS" : `FAILURES: ${fails}`);
process.exit(fails === 0 ? 0 : 1);
