// Loose Drawing のイラストを公式サイトから取得して public/illustrations/ に配置する。
// 素材そのものの再配布を避けるため画像はリポジトリに含めず、各環境が
// セットアップ時・ビルド時に原本サイトから直接取得する(取得済みならスキップ)。
// 規約: 商用可・加工可・クレジット不要、素材自体の再配布/販売は不可。
// https://loosedrawing.com/
import { mkdir, writeFile, access } from "node:fs/promises";

const IDS = [126, 535, 536, 757, 1122, 1168, 1498, 1628, 1822];
const DIR = new URL("../public/illustrations/", import.meta.url);

await mkdir(DIR, { recursive: true });
let fetched = 0;
for (const id of IDS) {
  const dest = new URL(`${id}.png`, DIR);
  try {
    await access(dest);
    continue; // 取得済み
  } catch {
    // 未取得なので続行
  }
  const res = await fetch(`https://loosedrawing.com/assets/media/illustrations/png/${id}.png`);
  if (!res.ok) {
    console.error(`fetch failed: ${id}.png (HTTP ${res.status})`);
    process.exit(1);
  }
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  fetched++;
}
console.log(`illustrations: ${fetched} fetched, ${IDS.length - fetched} already present`);
