import { test } from "node:test";
import assert from "node:assert/strict";
import { legacyThemesDestination, tagListUrl } from "../../src/lib/themes-urls";

const dest = (qs: string) => legacyThemesDestination(new URLSearchParams(qs));

test("tagListUrl: タグ0個は新着、ORはカンマ連結、ANDは /all", () => {
  assert.equal(tagListUrl([], "and"), "/themes");
  assert.equal(tagListUrl(["シナリオ"], "or"), "/themes/tag/%E3%82%B7%E3%83%8A%E3%83%AA%E3%82%AA");
  assert.equal(tagListUrl(["a", "b"], "and"), "/themes/tag/a%2Cb/all");
});

test("旧URL: タブ", () => {
  assert.equal(dest("tab=active"), "/themes/active");
  assert.equal(dest("tab=unread"), "/themes/unread");
  assert.equal(dest("tab=mine"), "/themes/mine");
  assert.equal(dest("tab=proposed"), "/themes/proposed");
  assert.equal(dest("tab=fresh"), "/themes");
  assert.equal(dest("tab=bogus"), "/themes");
});

test("旧URL: タグはタブより優先、tagmode=and は /all、空は新着", () => {
  assert.equal(dest("tag=a,b&tagmode=and&tab=active"), "/themes/tag/a%2Cb/all");
  assert.equal(dest("tag=a,b&tagmode=or"), "/themes/tag/a%2Cb");
  assert.equal(dest("tag=%E3%82%B7%E3%83%8A%E3%83%AA%E3%82%AA"), "/themes/tag/%E3%82%B7%E3%83%8A%E3%83%AA%E3%82%AA");
  assert.equal(dest("tag=&tagmode=and"), "/themes");
  assert.equal(dest("tag=+,+"), "/themes");
});

test("旧URL: 検索語はタブより優先、空白のみは新着", () => {
  assert.equal(dest("q=%E3%82%BD%E3%83%BC%E3%83%89&tab=active"), "/themes/search?q=%E3%82%BD%E3%83%BC%E3%83%89");
  assert.equal(dest("q=%20%20"), "/themes");
});
