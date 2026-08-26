import type { Metadata } from "next";

export const metadata: Metadata = { title: "プライバシーポリシー" };

const H = "mb-2 text-base font-semibold";
const P = "text-sm leading-relaxed text-stone-700";
const UL = "list-disc pl-5 text-sm leading-relaxed text-stone-700";

export default function PrivacyPage() {
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="mb-1 text-xl font-bold">プライバシーポリシー</h1>
        <p className="text-xs text-stone-600">2026年8月27日 制定</p>
      </div>

      <section>
        <h2 className={H}>1. 基本方針</h2>
        <p className={P}>
          TRPG学級会は「個人情報を持たない」ことを設計方針とするサービスです。
          アカウント登録はなく、氏名・メールアドレス・電話番号などの個人情報は収集しません。
        </p>
      </section>

      <section>
        <h2 className={H}>2. 収集する情報</h2>
        <ul className={UL}>
          <li>
            <strong>匿名参加者ID(cookie)</strong> — ブラウザごとに発行されるランダムなIDで、
            投票の重複防止と再訪時の状態復元に使います。実世界の身元とは紐づきません
          </li>
          <li>
            <strong>投票・投稿内容</strong> — 賛成/反対/パスの投票、投稿された意見・テーマ
          </li>
          <li>
            <strong>連投対策のための一時的な識別値</strong> — IPアドレスそのものは保存しません。
            IPアドレスから<strong>日替わりの方法で計算した復元不能な値</strong>を最大48時間保持します。
            計算方法が毎日変わるため、日をまたいだ突き合わせや長期的な追跡はできません
          </li>
        </ul>
      </section>

      <section>
        <h2 className={H}>3. 利用目的</h2>
        <ul className={UL}>
          <li>サービスの提供(投票の記録、意見マップの計算・表示)</li>
          <li>スパム・不正操作の防止</li>
          <li>匿名統計データとしての公開(第三者が計算結果を検証できるようにするため)</li>
        </ul>
      </section>

      <section>
        <h2 className={H}>4. 外部サービス</h2>
        <p className={P}>本サービスは以下の外部サービス上で動作し、通信時にアクセス元情報が各社の規約に基づいて処理されます。</p>
        <ul className={UL}>
          <li>Vercel(ホスティング)</li>
          <li>Neon(データベース)</li>
          <li>Cloudflare Turnstile(bot対策。テーマ提案時のみ)</li>
        </ul>
        <p className={P}>アクセス解析ツールや広告配信は使用していません。</p>
      </section>

      <section>
        <h2 className={H}>5. 第三者提供</h2>
        <p className={P}>
          収集した情報を第三者に販売・提供することはありません。
          法令に基づく開示請求があった場合も、氏名・IPアドレス等の個人を特定できる情報を
          そもそも保有していないため、開示できる発信者情報は原則存在しません
          (保有する範囲で法の定めに従い対応します)。
        </p>
      </section>

      <section>
        <h2 className={H}>6. データの削除</h2>
        <ul className={UL}>
          <li>ブラウザのcookieを削除すると、匿名IDとあなたの結び付きは失われます</li>
          <li>投稿の削除を希望する場合は、該当投稿の「通報」から依頼してください。ただし匿名性のため本人確認ができず、対応できない場合があります</li>
        </ul>
      </section>

      <section>
        <h2 className={H}>7. 改定</h2>
        <p className={P}>本ポリシーを変更する場合は、以下の改定履歴に記載します。</p>
        <ul className={UL}>
          <li>2026年8月27日 制定。同日、IP関連の保持方法を「30日保存」から「日替わり計算値を最大48時間保持」に変更</li>
        </ul>
      </section>
    </article>
  );
}
