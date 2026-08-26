import type { Metadata } from "next";
import Link from "next/link";
import { REMOVAL_CRITERIA } from "@/lib/rules";

export const metadata: Metadata = { title: "利用規約" };

const H = "mb-2 text-base font-semibold";
const P = "text-sm leading-relaxed text-stone-700";
const UL = "list-disc pl-5 text-sm leading-relaxed text-stone-700";

export default function TermsPage() {
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="mb-1 text-xl font-bold">利用規約</h1>
        <p className="text-xs text-stone-600">2026年8月27日 制定</p>
      </div>

      <section>
        <h2 className={H}>1. このサービスについて</h2>
        <p className={P}>
        「TRPG学級会」(以下「本サービス」)は、TRPGに関する話題への投票と意見投稿を通じて、
          意見の分布と合意点を可視化する非営利のコミュニティサービスです。
          個人が運営しており、予告なく内容の変更・停止を行うことがあります。
        </p>
      </section>

      <section>
        <h2 className={H}>2. 利用条件</h2>
        <ul className={UL}>
          <li>アカウント登録は不要です。本サービスの利用をもって本規約に同意したものとみなします</li>
          <li>参加者の識別はブラウザに保存される匿名ID(cookie)によって行います</li>
          <li>bot等による自動操作、レート制限の回避、複数の識別子を用いた組織的な投票操作を禁止します</li>
        </ul>
      </section>

      <section>
        <h2 className={H}>3. 投稿とデータの取り扱い</h2>
        <ul className={UL}>
          <li>投稿された意見・テーマの著作権は投稿者に帰属します</li>
          <li>
            投稿者は運営に対し、本サービス上での表示・集計・意見マップの計算、および
            <strong>匿名化された投票データ・意見テキストの公開</strong>
            (第三者による検証を目的としたエクスポート)に必要な範囲での利用を許諾するものとします
          </li>
          <li>匿名投稿という性質上、投稿後に「自分の投稿である」ことを証明して撤回する手段は原則ありません。投稿は慎重に行ってください</li>
        </ul>
      </section>

      <section>
        <h2 className={H}>4. 禁止事項と削除</h2>
        <p className={P}>
          次に該当する投稿は、通報を受けて確認のうえ削除します(事前審査は行いません)。
          詳しい線引きは
          <Link href="/about" className="underline">
            仕組みとルール
          </Link>
          を参照してください。
        </p>
        <ul className={UL}>
          {REMOVAL_CRITERIA.map((c) => (
            <li key={c.label}>{c.detail}</li>
          ))}
        </ul>
        <p className={P}>
          「不快である」「論争的である」ことは削除理由になりません。
        </p>
      </section>

      <section>
        <h2 className={H}>5. 免責</h2>
        <ul className={UL}>
          <li>本サービスは「あるがまま」の状態で提供されるものであり、品質・可用性・正確性の保証はありません</li>
          <li>投稿内容は各投稿者の責任であり、運営はその内容について責任を負いません</li>
          <li>意見マップは統計的な近似であり、参加者の思想の断定を意味しません</li>
          <li>本サービスの利用により生じた損害について、運営は故意または重過失による場合を除き責任を負いません</li>
        </ul>
      </section>

      <section>
        <h2 className={H}>6. 規約の変更</h2>
        <p className={P}>
          本規約を変更する場合は、本ページで告知します。重要な変更はトップページでも案内します。
        </p>
      </section>

      <section>
        <h2 className={H}>7. 準拠法</h2>
        <p className={P}>本規約は日本法に準拠します。</p>
      </section>

      <section>
        <h2 className={H}>8. 連絡</h2>
        <p className={P}>
          削除依頼・お問い合わせは各投稿の「通報」ボタンから届きます。
        </p>
      </section>
    </article>
  );
}
