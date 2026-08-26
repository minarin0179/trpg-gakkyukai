import type { Metadata } from "next";
import { ThemeForm } from "@/components/ThemeForm";
import { TURNSTILE_SITE_KEY } from "@/lib/turnstile";

export const metadata: Metadata = { title: "テーマを提案" };

export default function NewThemePage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-1 text-xl font-bold">テーマを提案する</h1>
      <p className="mb-6 text-sm text-stone-600">
        アカウント登録は不要です。TRPGにまつわる、賛否の分かれそうな問いを投げてみてください。
      </p>
      <ThemeForm siteKey={TURNSTILE_SITE_KEY} />
    </div>
  );
}
