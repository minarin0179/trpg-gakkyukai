import { findContentViolation } from "./content-filter";
import { TAG_MAX_LENGTH } from "./config";

// タグの正規化と検証。NFKC正規化+trimで全角半角などの揺れを吸収し、
// 不正なら理由(エラー文言)を返す。一般ユーザーの付与と管理ツールで共用
export function normalizeTag(raw: string): { tag?: string; error?: string } {
  const tag = raw.normalize("NFKC").trim();
  if (tag.length === 0) return { error: "タグを入力してください" };
  if (tag.length > TAG_MAX_LENGTH) return { error: `タグは${TAG_MAX_LENGTH}文字以内です` };
  if (/[,\n]/.test(tag)) return { error: "タグにカンマと改行は使えません" };
  const violation = findContentViolation(tag);
  if (violation) return { error: violation };
  return { tag };
}
