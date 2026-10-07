import { test } from "node:test";
import assert from "node:assert/strict";
import { composeNewThemeText } from "../../src/lib/x-new-theme-text";
import { xLength, X_MAX_UNITS } from "../../src/lib/digest-text";

const URL = "https://trpg-gakkyukai.com/t/abcdefghijkl";

test("見出し・タイトル・URL の3行", () => {
  assert.equal(
    composeNewThemeText("KPとしての心掛け", URL),
    `新しいテーマが提案されました\n「KPとしての心掛け」\n${URL}`,
  );
});

test("前後の空白は落とす", () => {
  assert.equal(composeNewThemeText("  題  ", URL).split("\n")[1], "「題」");
});

test("長いタイトルは280単位に収まるよう省略される", () => {
  const long = "あ".repeat(300);
  const text = composeNewThemeText(long, URL);
  assert.ok(xLength(text) <= X_MAX_UNITS, `length=${xLength(text)}`);
  assert.ok(text.split("\n")[1].endsWith("…」"));
});
