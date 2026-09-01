import type { Metadata } from "next";
import { ThemeForm } from "@/components/ThemeForm";
import { getTagVocabulary } from "@/lib/queries";
import { TURNSTILE_SITE_KEY } from "@/lib/turnstile";
import { TopicGuidelines } from "@/components/TopicGuidelines";

export const metadata: Metadata = { title: "テーマを提案" };

// タグ語彙(既存タグ一覧)を含むためISRにする。5分の鮮度で十分
export const revalidate = 300;

export default async function NewThemePage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-1 text-xl font-bold">テーマを提案する</h1>
      <p className="mb-6 text-sm text-stone-700 dark:text-stone-300">
        アカウント登録は不要です。TRPGにまつわる、賛否の分かれそうな問いを投げてみてください。
      </p>
      <div className="mb-8">
        <h2 className="mb-3 text-base font-semibold">テーマにできること・できないこと</h2>
        <TopicGuidelines />
      </div>
      <ThemeForm siteKey={TURNSTILE_SITE_KEY} tagVocabulary={await getTagVocabulary()} />
    </div>
  );
}
