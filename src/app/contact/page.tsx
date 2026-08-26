import type { Metadata } from "next";
import { ContactForm } from "@/components/ContactForm";

export const metadata: Metadata = { title: "お問い合わせ" };

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-1 text-xl font-bold">お問い合わせ</h1>
      <p className="mb-6 text-sm text-stone-700">
        不具合の報告・削除依頼・ご意見などはこちらから。
        投稿の削除依頼は各投稿の「通報」ボタンからも送れます。
      </p>
      <ContactForm />
    </div>
  );
}
