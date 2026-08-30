// 類似テーマ検出フローのE2Eテスト(テストブランチDB+localhost:3100前提)。
// 検証: ①類似タイトル入力中にライブ確認表示 ②表示後は1回の送信で作成
//       ③完全一致→ハードエラー ④非類似→表示なしで直接作成 ⑤埋め込み保存
import { chromium } from "playwright";
import { neon } from "@neondatabase/serverless";

const BASE = "http://localhost:3100";
const SHOT = process.env.SHOT || "similar.png";
const sql = neon(process.env.DATABASE_URL);

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
}

async function maxSim(title) {
  const res = await fetch("http://localhost:8787/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts: [title] }),
  });
  const { vectors } = await res.json();
  const vec = JSON.stringify(vectors[0]);
  const [row] = await sql`SELECT max(1 - (embedding <=> ${vec}::vector)) AS s
    FROM themes WHERE status = 'active' AND embedding IS NOT NULL`;
  return Number(row.s);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
const panel = () => page.getByText("似ているテーマが見つかりました");

async function fillForm(title) {
  await page.goto(`${BASE}/new`, { waitUntil: "load" });
  await page.fill("#title", title);
  await page.fill("#seeds", "賛成の言い分です\n反対の言い分です"); // ここでtitleがblurされ即時チェックが走る
  await page.waitForFunction(
    () => document.querySelector('[name="cf-turnstile-response"]')?.value?.length > 0,
    { timeout: 30000 },
  );
}
const submit = () => page.getByRole("button", { name: "テーマを公開する" }).click();

try {
  // ①② 類似タイトル: 送信せずにライブ確認表示 → 1回の送信で作成
  await fillForm("TRPGの立ち絵って本当に必要?");
  await panel().waitFor({ timeout: 20000 }); // 送信前に出るのがポイント
  const listed = await page.locator("li a[href^='/t/']").allTextContents();
  check("入力中(送信前)にライブ確認表示が出る", true);
  check(
    "確認表示に立ち絵テーマが並ぶ",
    listed.some((t) => t.includes("立ち絵")),
    listed.join(" / "),
  );
  await page.screenshot({ path: SHOT });
  await submit();
  await page.waitForURL(/\/t\/[A-Za-z0-9_-]+/, { timeout: 30000 });
  check("表示を見た後は1回の送信で作成される", true, page.url());
  const newId = page.url().split("/t/")[1];
  const [row] = await sql`SELECT embedding IS NOT NULL AS has FROM themes WHERE id = ${newId}`;
  check("作成テーマに埋め込みが保存される", row?.has === true);

  // ③ 完全一致タイトル → (ライブ表示は出るが)送信はハードエラー
  await fillForm("TRPGにおける立ち絵の必要性について");
  await panel().waitFor({ timeout: 20000 });
  await submit();
  await page.getByText("同じタイトルのテーマがすでにあります").waitFor({ timeout: 20000 });
  check("完全一致タイトルは拒否される", true);

  // ④ 非類似タイトル → ライブ表示なし・確認なしで直接作成
  const unique = "コンベンション会場の香水マナーについて";
  const s = await maxSim(unique);
  check("プローブが実際に非類似(<0.90)", s < 0.9, `maxSim=${s.toFixed(3)}`);
  await fillForm(unique);
  await page.waitForTimeout(2500); // デバウンス+チェック完了を待ってから不在を確認
  check("非類似タイトルではライブ表示が出ない", !(await panel().isVisible()));
  await submit();
  await page.waitForURL(/\/t\/[A-Za-z0-9_-]+/, { timeout: 30000 });
  check("非類似タイトルは確認なしで作成される", true);
} catch (e) {
  check(`例外: ${e.message?.slice(0, 200)}`, false);
  await page.screenshot({ path: SHOT.replace(/\.png$/, "-error.png") }).catch(() => {});
} finally {
  await browser.close();
}

const fails = results.filter((r) => !r.ok).length;
console.log(fails === 0 ? "ALL PASS" : `FAILURES: ${fails}`);
process.exit(fails === 0 ? 0 : 1);
