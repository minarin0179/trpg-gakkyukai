import Link from "next/link";
import Image from "next/image";
import { listThemes } from "@/lib/queries";
import { ThemeCard } from "@/components/ThemeCard";
import { STATEMENT_MAX, PROMOTION_MIN_PARTICIPANTS } from "@/lib/config";

// トップは個人化データを持たない(featuredは共有情報)ので、ISRで60秒キャッシュし
// DB転送を大幅に削減する。新規テーマ等は最大60秒で反映される。
export const revalidate = 60;

const FEATURES = [
  {
    title: "リプライ欄のない議論",
    body: "ここには返信機能がありません。他人の意見にできるのは「賛成 / 反対 / パス」の投票だけ。言い負かすための道具が最初から存在しないので、口論になりようがありません。",
  },
  {
    title: "考えの近い人が、自然と集まって見える",
    body: "投票のパターンが似た参加者は、2Dの「意見マップ」上で近くに置かれ、自動でグループにまとまります。界隈にどんな立場がいくつあるのか、自分はどこにいるのかが俯瞰できます。",
  },
  {
    title: "全グループが頷いた意見を探し出す",
    body: "タイムラインで拡散されるのは、いちばん過激な意見です。このサイトが探すのはその逆——立場の違うグループのどれもが賛成した意見、つまり界隈が実は共有している認識です。",
  },
  {
    title: "アカウントという概念がない",
    body: "登録フォームすらありません。名前もメールアドレスも聞かず、リンクを開いてタップすればそれが参加です。身元ではなく、意見だけがここに残ります。",
  },
];

const STEPS = [
  {
    image: "/illustrations/1168.png",
    title: "テーマを開く",
    body: "気になるテーマを選ぶと、これまでに投稿された意見がカードで1枚ずつ表示されます。",
  },
  {
    image: "/illustrations/757.png",
    title: "賛成・反対・パスで投票",
    body: "各意見に直感で答えていくだけ。投票を重ねると、意見マップにあなたの立場が現れます。どちらとも言えないときは遠慮なくパスしてOK。",
  },
  {
    image: "/illustrations/126.png",
    title: "自分の意見を書いてもいい",
    body: `言い足りないことがあれば、あなたの意見を1つ${STATEMENT_MAX}文字以内で投稿できます。それが今度は他の参加者の投票対象になり、賛同が集まればグループを越えた合意として浮かび上がります。`,
  },
];

export default async function HomePage() {
  const { main, fresh } = await listThemes();
  const featured = [...main, ...fresh].slice(0, 3);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-28 py-8 sm:gap-36">
      {/* ヒーロー */}
      <section className="text-center">
        <div className="mx-auto mb-6 flex w-fit items-end justify-center">
          <Image src="/illustrations/535.png" alt="" width={170} height={170} priority />
          <Image src="/illustrations/536.png" alt="" width={170} height={170} priority />
        </div>
        <h1 className="text-3xl font-bold leading-snug sm:text-4xl">
          レスバより、
          <br className="sm:hidden" />
          セッションを。
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
          <strong>TRPG学級会</strong>は、TRPGにまつわる賛否の分かれる話題に
          「賛成 / 反対 / パス」で投票して、意見の全体像と
          <strong>グループを越えた合意点</strong>を見つける場所です。
          言い合いではなく、卓を囲んで一緒に作る——議論もまた、ひとつのセッションです。
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/themes"
            className="rounded-md bg-stone-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
          >
            議論をのぞいてみる
          </Link>
          <Link
            href="/new"
            className="rounded-md border border-stone-500 px-6 py-2.5 text-sm font-semibold text-stone-700 hover:border-stone-600 dark:border-stone-700 dark:text-stone-300 dark:hover:border-stone-600"
          >
            テーマを提案する
          </Link>
        </div>
        <p className="mt-3 text-xs text-stone-600 dark:text-stone-500">
          アカウント登録なし・匿名のまま、いますぐ参加できます。
</p>
      </section>

      {/* 特徴 */}
      <section id="features" className="reveal scroll-mt-20">
        <div className="mx-auto mb-4 w-fit">
          <Image src="/illustrations/1628.png" alt="散布図を分析するイラスト" width={150} height={150} />
        </div>
        <h2 className="mb-6 text-center text-xl font-bold">このサイトの仕組み</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="reveal rounded-lg border border-stone-400 bg-white p-5 dark:border-stone-800 dark:bg-stone-900"
            >
              <h3 className="mb-2 font-semibold">{f.title}</h3>
              <p className="text-sm leading-relaxed text-stone-700 dark:text-stone-500">{f.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-stone-600 dark:text-stone-500">
          意見マップの計算には、台湾の国民的議論などで実績のある{" "}
          <a href="https://pol.is" className="underline" rel="noopener">
            Polis
          </a>{" "}
          と同じ公開アルゴリズムを使っています。
          詳しくは
          <Link href="/about" className="underline">
            ルールと仕組み
          </Link>
          へ。
        </p>
      </section>

      {/* 使い方 */}
      <section id="howto" className="reveal scroll-mt-20">
        <h2 className="mb-6 text-center text-xl font-bold">使い方は3ステップ</h2>
        <ol className="flex flex-col gap-4">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className="reveal flex gap-4 rounded-lg border border-stone-400 bg-white p-5 dark:border-stone-800 dark:bg-stone-900"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-300 text-sm font-bold text-stone-900">
                {i + 1}
              </span>
              <div className="flex-1">
                <h3 className="mb-1 font-semibold">{s.title}</h3>
                <p className="text-sm leading-relaxed text-stone-700 dark:text-stone-500">{s.body}</p>
              </div>
              <div className="hidden h-20 w-20 shrink-0 items-center justify-center self-center sm:flex">
                <Image src={s.image} alt="" width={72} height={72} />
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-4 rounded-lg border border-dashed border-stone-500 p-4 text-sm leading-relaxed text-stone-700 dark:border-stone-700 dark:text-stone-500">
          <strong className="text-stone-800 dark:text-stone-200">議題を立てたい人へ:</strong>{" "}
          テーマの提案も登録不要です。審査はなく即時公開され、まず
          <Link href="/themes" className="underline">
            新着タブ
          </Link>
          に載ります。{PROMOTION_MIN_PARTICIPANTS}人が投票すると人気タブにも並びます。
          運営が事前に内容を選別することはありません。
        </div>
      </section>

      {/* いま議論されているテーマ */}
      {featured.length > 0 && (
        <section id="themes" className="reveal scroll-mt-20">
          <div className="mx-auto mb-2 w-fit">
            <Image src="/illustrations/1822.png" alt="" width={90} height={90} />
          </div>
          <h2 className="mb-4 text-center text-xl font-bold">いま議論されているテーマ</h2>
          <div className="flex flex-col gap-3">
            {featured.map((t) => (
              <div key={t.id} className="reveal">
                <ThemeCard theme={t} />
              </div>
            ))}
          </div>
          <p className="mt-4 text-center">
            <Link
              href="/themes"
              className="text-sm font-medium underline"
            >
              すべてのテーマを見る →
            </Link>
          </p>
        </section>
      )}

      {/* 問題提起と理念 */}
      <section id="why" className="reveal scroll-mt-20">
        <div className="mx-auto mb-4 w-fit">
          <Image src="/illustrations/1122.png" alt="スマホのクソリプに手をかざす人のイラスト" width={150} height={150} />
        </div>
        <h2 className="mb-4 text-center text-xl font-bold">
          このサイトが目指すもの
        </h2>
        <div className="flex flex-col gap-4 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
          <p>
            TRPG界隈では、セッションの作法、システムの解釈、セーフティツール、
            キャラロストの是非——さまざまな話題で、定期的に論争が起きます。
            界隈ではそれを半ば自嘲的に「学級会」と呼んできました。
          </p>
          <p>
            でも、思い出してみてください。学級会が荒れるのは、
            いちばん強い言葉ばかりが拡散され、言い負かし合いになるからです。
            静かに聞いている大多数の「そこまで極端じゃない意見」は、
            どこにも見えません。SNSのタイムラインとリプライ欄は、
            まさにその構造でできています。
          </p>
          <p>
            このサイトは、その構造ごと取り替える試みです。
            反論の応酬の代わりに投票を。声の大きさの代わりに全員の分布を。
            勝ち負けの代わりに、立場が違っても共有できている認識を。
          </p>
          <p className="font-medium">
            同じ「学級会」をするなら、ちゃんと結論の出る学級会にしてみませんか。
          </p>
        </div>
      </section>

      {/* 運営方針 */}
      <section id="policy" className="reveal scroll-mt-20 rounded-lg border border-stone-400 bg-white p-6 text-center dark:border-stone-800 dark:bg-stone-900">
        <div className="mx-auto mb-3 w-fit">
          <Image src="/illustrations/1498.png" alt="握手のイラスト" width={130} height={130} />
        </div>
        <h2 className="mb-2 text-base font-bold">運営の約束</h2>
        <p className="text-sm leading-relaxed text-stone-700 dark:text-stone-500">
          「不快・論争的だから」という理由で投稿を消しません。削除するのは実在個人への攻撃・
          個人情報・違法・スパムなど、明文化された基準に該当するものだけです。個人情報は集めません。
          マップの計算も一覧の並び順も公開されている標準の手法をそのまま使い、
          運営の裁量で結果を操作しない設計にしています。
        </p>
        <Link href="/about" className="mt-3 inline-block text-sm font-medium underline">
          ルールと仕組みの全文を読む
        </Link>
      </section>
    </div>
  );
}
