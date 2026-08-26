import type { Metadata } from "next";
import { TopicGuidelines } from "@/components/TopicGuidelines";
import { REMOVAL_CRITERIA } from "@/lib/rules";

export const metadata: Metadata = { title: "仕組みとルール" };

export default function AboutPage() {
  return (
    <article className="prose-sm mx-auto flex max-w-2xl flex-col gap-8">
      <section>
        <h1 className="mb-3 text-xl font-bold">仕組みとルール</h1>
        <p className="text-sm leading-relaxed text-stone-700">
          <strong>TRPG学級会</strong>は、TRPGにまつわる論点への「賛成 / 反対 / パス」の投票から、
          意見グループの地図と、グループを越えて合意されている意見を見つけ出す場所です。
          SNSのリプライ欄と違って、ここでは誰かを言い負かす必要はありません。
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">テーマにできること・できないこと</h2>
        <TopicGuidelines />
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">削除基準</h2>
        <p className="text-sm leading-relaxed text-stone-700">
          テーマと意見は審査なしで即時公開されます。運営が削除するのは、通報を受けて確認した
          次に該当するものだけです。
        </p>
        <ol className="mt-2 list-decimal pl-5 text-sm text-stone-700">
          {REMOVAL_CRITERIA.map((c) => (
            <li key={c.label}>{c.detail}</li>
          ))}
        </ol>
        <p className="mt-2 text-sm leading-relaxed text-stone-700">
          <strong>「不快である」「論争的である」は削除理由になりません。</strong>
          対立のある話題を扱うことが、この場所の目的だからです。
          削除の実施履歴は今後このページで公開します。
        </p>
        <p className="mt-2 text-sm leading-relaxed text-stone-700">
          このほか、内容の善悪に関わらず構造で判定できるもの
          (URL・メールアドレス・電話番号・SNSアカウント名・同一文字の連打・同一テーマ内の重複投稿)は、
          スパムと個人特定の入口を塞ぐため投稿時に自動で弾かれます。
          単語ベースの自動検閲は行いません(「殺す」「ロスト」等はTRPGの正当な語彙のため)。
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">意見マップの見かた</h2>
        <ul className="list-disc pl-5 text-sm leading-relaxed text-stone-700">
          <li>マップの点は参加者です。近くにいる人ほど投票のパターンが似ています</li>
          <li>7票以上投票すると、あなたの点がマップに表示されます(意見が7件未満のテーマでは、その意見数まで下がります)</li>
          <li>投票の傾向が似た参加者は、自動で意見グループ(最大5つ)にまとまります</li>
          <li>立場の違うグループのどれもが賛成した意見は「グループを越えた合意」として表示されます</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">プライバシー</h2>
        <ul className="list-disc pl-5 text-sm text-stone-700">
          <li>アカウント登録はなく、氏名・メールアドレス等の個人情報は収集しません</li>
          <li>参加者の識別はブラウザに保存される匿名ID(cookie)のみで行います</li>
          <li>スパム対策のためIPアドレスをハッシュ化した値を短期間保存します(生のIPは保存しません)</li>
          <li>投票データは統計処理と意見マップの表示にのみ使用します</li>
        </ul>
        <p className="mt-2 text-sm text-stone-700">
          詳細は<a href="/privacy" className="underline">プライバシーポリシー</a>と
          <a href="/terms" className="underline">利用規約</a>を参照してください。
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">透明性 — アルゴリズムの詳細</h2>
        <p className="text-sm leading-relaxed text-stone-700">
          運営が結果や見え方を操作していないことを、誰でも確認できるようにしています。
          細かい話なので、興味のある方向けです。
        </p>
        <ul className="mt-2 list-disc pl-5 text-sm leading-relaxed text-stone-700">
          <li>
            意見マップの計算は、
            <a href="https://pol.is" className="underline" rel="noopener">Polis</a>
            の公開アルゴリズムを再実装したオープンソースライブラリ
            <a href="https://github.com/polis-community/red-dwarf" className="underline" rel="noopener">red-dwarf</a>
            (v0.4.0, MPL 2.0)をデフォルトパラメータのまま使用。投票の行列を主成分分析(PCA)で
            2次元に落とし、k-meansでグループを検出します(手法の詳細はPolisの論文 Small et al. 2021)
          </li>
          <li>乱数シードを固定しているため、同じ投票データからは常に同じマップが生成されます</li>
          <li>
            「議論中」一覧の並び順は Hacker News と同じ時間減衰ランキング
            (投票者数 ÷ (経過日数 + 2)<sup>1.8</sup>)。古いテーマは自然に沈み、
            運営が手動で順位を操作することはありません
          </li>
          <li>
            多重投票について: 匿名参加のため技術的には同一人物の複数参加が可能ですが、
            ここは多数決ではなく意見の「地形」を描く場です。同じ投票パターンを水増ししても
            地形はほぼ変わらず、「グループを越えた合意」は1つのグループの水増しでは作れません
          </li>
          <li>パラメータや基準を変更する場合は、このページに履歴を残します</li>
          <li>
            ソースコードは公開予定です。テーマごとの匿名投票データのエクスポート機能も準備中で、
            エクスポートとred-dwarfを使えば、誰でも手元で同じマップを再計算・検証できます
          </li>
        </ul>
      </section>
    </article>
  );
}
