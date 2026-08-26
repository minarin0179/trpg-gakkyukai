import type { Metadata } from "next";

export const metadata: Metadata = { title: "仕組みとルール" };

export default function AboutPage() {
  return (
    <article className="prose-sm mx-auto flex max-w-2xl flex-col gap-8">
      <section>
        <h1 className="mb-3 text-xl font-bold">仕組みとルール</h1>
        <p className="text-sm leading-relaxed text-stone-700">
          TRPG学級会は、TRPGにまつわる論点への「賛成 / 反対 / パス」の投票から、
          意見グループの地図と、グループを越えて合意されている意見を見つけ出す場所です。
          SNSのリプライ欄と違って、ここでは誰かを言い負かす必要はありません。
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">意見マップの計算方法</h2>
        <p className="text-sm leading-relaxed text-stone-700">
          計算には、
          <a href="https://pol.is" className="underline" rel="noopener">Polis</a>
          の公開アルゴリズムを再実装したオープンソースライブラリ
          <a href="https://github.com/polis-community/red-dwarf" className="underline" rel="noopener">
            red-dwarf
          </a>
          (v0.4.0, MPL 2.0)を、デフォルトパラメータのまま使っています。
          投票の行列を主成分分析(PCA)で2次元に落とし、k-meansで意見グループを検出します。
          手法の詳細はPolisの論文(Small et al. 2021)で公開されています。
        </p>
        <ul className="mt-2 list-disc pl-5 text-sm text-stone-700">
          <li>7票以上投票した参加者がマップに表示されます(Polis標準の「7票ルール」。意見が7件未満のテーマでは、その意見数まで下がります)</li>
          <li>意見グループは最大5つまで自動検出されます(Polis標準)</li>
          <li>乱数シードを固定しているため、同じ投票データからは常に同じマップが生成されます</li>
          <li>運営はパラメータを変更していません。変更する場合はこのページに履歴を残します</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">多重投票について</h2>
        <p className="text-sm leading-relaxed text-stone-700">
          参加はアカウント不要(ブラウザごとの匿名ID)なので、技術的には同じ人が複数回参加できます。
          それでもこの仕組みが成立するのは、ここが多数決ではないからです。
          マップは意見の「地形」を描くもので、同じ投票パターンを水増ししても地形はほぼ変わらず、
          「グループを越えた合意」は1つのグループを水増ししても作れません。
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">削除基準</h2>
        <p className="text-sm leading-relaxed text-stone-700">
          テーマと意見は審査なしで即時公開されます。運営が削除するのは、通報を受けて確認した
          次の4つに該当するものだけです。
        </p>
        <ol className="mt-2 list-decimal pl-5 text-sm text-stone-700">
          <li>実在の個人への攻撃・誹謗中傷(実名・特定可能なハンドル問わず)</li>
          <li>個人情報の暴露</li>
          <li>法令に違反する内容</li>
          <li>機械的なスパム</li>
        </ol>
        <p className="mt-2 text-sm leading-relaxed text-stone-700">
          <strong>「不快である」「論争的である」は削除理由になりません。</strong>
          対立のある話題を扱うことが、この場所の目的だからです。
          削除の実施履歴は今後このページで公開します。
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">プライバシー</h2>
        <ul className="list-disc pl-5 text-sm text-stone-700">
          <li>アカウント登録はなく、氏名・メールアドレス等の個人情報は収集しません</li>
          <li>参加者の識別はブラウザに保存される匿名ID(cookie)のみで行います</li>
          <li>スパム対策のためIPアドレスをハッシュ化した値を短期間保存します(生のIPは保存しません)</li>
          <li>投票データは統計処理と意見マップの表示にのみ使用します</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">透明性</h2>
        <p className="text-sm leading-relaxed text-stone-700">
          このサービスのソースコードは公開予定です。また、テーマごとの匿名投票データの
          エクスポート機能を準備中です。エクスポートされたデータとred-dwarfを使えば、
          誰でも手元で同じマップを再計算して、運営が結果を操作していないことを検証できます。
        </p>
      </section>
    </article>
  );
}
