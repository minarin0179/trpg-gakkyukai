// 「テーマにできること・できないこと」の基準。
// ルールページ(/about)とテーマ投稿ページ(/new)の両方で使う共通コンポーネント。
// 基準の変更は必ずこのファイルだけで行うこと(掲載箇所間の食い違いを防ぐ)。
// 削除基準(ハードルール)は src/lib/rules.ts を参照。

export function TopicGuidelines({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {!compact && (
        <p className="text-sm leading-relaxed text-stone-700">
          迷ったときの原則はひとつ——<strong>「人ではなく、論点を扱う」</strong>。
        </p>
      )}
      <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4">
        <h3 className="mb-1 text-sm font-semibold text-emerald-900">⭕ テーマにできる</h3>
        <p className="mb-1 text-sm leading-relaxed text-emerald-900">
          TRPGに関する、意見の分かれる話題。例えば:
        </p>
        <ul className="list-disc pl-5 text-sm leading-relaxed text-emerald-900">
          <li>プレイスタイルや遊び方の方針</li>
          <li>ルールの解釈と運用</li>
          <li>卓のマナー・コミュニケーション</li>
          <li>セーフティツールの使い方</li>
          <li>キャラクターロストや致死性の扱い</li>
          <li>配信・リプレイなどの発信文化</li>
          <li>商業・同人シナリオをめぐる慣行</li>
        </ul>
      </div>
      <div className="rounded-lg border border-rose-300 bg-rose-50 p-4">
        <h3 className="mb-1 text-sm font-semibold text-rose-900">❌ テーマにできない</h3>
        <ul className="list-disc pl-5 text-sm leading-relaxed text-rose-900">
          <li>実在の個人・特定の卓・進行中の揉め事の当事者を裁くもの(「〇〇さんのあの発言は許されるのか」)</li>
          <li>特定の作品・シナリオを名指しで断罪するもの(「シナリオ〇〇は地雷か」)。作り手への攻撃になりやすいため、論点に言い換えてください</li>
          <li>シナリオの核心的なネタバレを前提にしないと成立しないもの(ネタバレを隠す機能はありません)</li>
          <li>個人が特定できる情報(実名・ハンドル名・アカウント名など)を含むもの</li>
          <li>TRPGと関係のない話題(政治・宗教の主張や勧誘など)</li>
        </ul>
      </div>
      <p className="text-sm leading-relaxed text-stone-700">
        個別の揉め事や特定の作品への不満も、<strong>一般化すればテーマにできます</strong>。
        「〇〇さんの発言はどうなのか」ではなく「配信中のGMの発言は、どこまで卓の外に持ち出してよいか」。
        「シナリオ〇〇は地雷か」ではなく「高難度・高致死シナリオの事前警告はどこまで必要か」。
        この言い換えこそが、学級会をセッションに変える第一歩です。
      </p>
    </div>
  );
}
