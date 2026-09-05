# TRPG学級会

TRPGにまつわる論点に「賛成 / 反対 / パス」で投票し、意見グループの地図と
グループを越えた合意点を可視化する、Polis型の合意形成プラットフォーム。

- 本番: https://trpg-gakkyukai.com

## 技術スタック

- Next.js (App Router) + Tailwind CSS / Vercel (Fluid Compute)
- Neon Postgres + Drizzle ORM
- クラスタリング: [red-dwarf](https://github.com/polis-community/red-dwarf) (Polis準拠, MPL 2.0)
  を Vercel Python Function (`api/compute.py`) で実行
- bot対策: Cloudflare Turnstile (開発中は公式テストキー)

## 開発環境

要件: Node 24+ / Python 3.12 + [uv](https://docs.astral.sh/uv/) / Vercel CLI

```bash
npm install
uv venv && uv pip install -r requirements-dev.txt   # 本番の依存は requirements.txt

# イラスト素材の取得(Loose Drawing公式サイトから。リポジトリには非同梱)
npm run setup:assets

# 環境変数(Vercelから取得。COMPUTE_URL=http://localhost:8787 をローカル用に追記)
vercel env pull .env.local

# スキーマ反映(初回。既存DBに対しては下の「マイグレーション」を参照)
DATABASE_URL=<開発用のNeonブランチ> npm run db:migrate

# 2プロセスで起動
npm run compute:dev   # クラスタリング計算サーバー (localhost:8787)
npm run dev           # Next.js (localhost:3000)

# テストデータ投入(任意)
node --env-file=.env.local scripts/seed.mjs
```

## マイグレーション

スキーマの変更は `drizzle-kit` の generate/migrate で運用する(SQLをリポジトリで管理する)。

1. `src/db/schema.ts` を編集し、`npm run db:generate` を実行する。
   `drizzle/` 配下に連番のSQLとスナップショット(`drizzle/meta/`)が生成されるので、
   SQLを目視で確認したうえでコードと一緒にコミットする。
2. まずNeonのブランチに当てて確認する。
   `DATABASE_URL=<ブランチの接続文字列> npm run db:migrate`
   問題なければ本番の `DATABASE_URL` で同じコマンドを実行する。

補足:

- `drizzle-kit push` は使わない。Neonでは `pg_stat_statements` ビューの
  読み取りで失敗するため(introspectが通らない)。
- pgvector拡張(類似テーマ検出に使う `vector(256)` 列)は
  マイグレーション0000の `CREATE EXTENSION IF NOT EXISTS vector;` で有効化される。
- 本番DBは 2026-09-02 にベースライン化済み。マイグレーション0000は
  `drizzle.__drizzle_migrations` に「適用済み」として登録してあるため、
  `npm run db:migrate` は0001以降だけを適用する。

## 構成メモ

- `src/db/schema.ts` — themes / participants / statements / votes / theme_tags /
  math_results / reports / rate_events
- `src/app/actions/` — Server Actions(`themes.ts` テーマ提案・タグ / `statements.ts` 意見投稿・投票 / `reports.ts` 通報・問い合わせ)
- `src/lib/recompute.ts` — 投票後の再計算オーケストレーション(最短30分間隔。自分の点はクライアント側でライブ投影)
- `api/_logic.py` — red-dwarf呼び出し本体(エンドポイントから分離、単体テスト可)
- `api/_http.py` — Python Function共通のHTTP層(内部鍵の検証・JSON読み取り・応答)
- `src/app/api/cron/recompute/route.ts` — 日次バックストップ(vercel.json の crons)
- `src/lib/digest.ts` / `src/lib/digest-text.ts` — 週次のX投稿の集計と、
  週の区切り・投稿文の組み立て(後者はDBに触れないので単体テストの対象)
- `src/lib/x-post-guard.ts` — 週次のX投稿の重複防止(Runtime Cacheの目印)
- `src/lib/x-post.ts` — Xへの投稿(OAuth 1.0a・依存なし)
- 参加者は匿名cookie(`gk_pid`)のみで識別。個人情報は保存しない

## 週次のX投稿

1週間(日本時間の月曜0:00〜翌月曜0:00)によく話されたテーマを、週に一度Xへ投稿する。
公開ページは持たず、DBにも何も保存しない。投稿するそのときに前の週を数え直し、
投稿したら結果は捨てる(週1回の投稿のために専用のテーブルを持たない)。

投稿の中身は「その週に投票した人数が多かったテーマのタイトル(最大5件)」と、
人気タブ(`/themes?tab=active`)へのリンクだけ。長いタイトルは全角24字で切り、
280単位(全角140字)に収まらない行は落とす。

```
今週のTRPG学級会(8/31〜9/6)
投票が多かったテーマ
「遅刻の扱い」
「キャラシの提出期限」
https://trpg-gakkyukai.com/themes?tab=active
```

- cron: `vercel.json` の `/api/cron/digest`(`0 11 * * 1` = 毎週月曜11:00 UTC)。
  日本時間では月曜20:00で、対象は「直前に終わった週」。週が終わった直後ではなく
  月曜の夜にしているのは、週明けに人が戻る時間帯に告知を出すため。
- 二重投稿の防止は Runtime Cache の目印だけ(`x-post` 名前空間・14日)。
  同じ週をもう一度走らせたとき、キャッシュが覚えていればスキップする。
  リージョンごと・ベストエフォートなので保証ではない(保証が要るならDBに記録する)。
- 週の指定と、目印を無視した投稿し直し:

  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" \
    "https://trpg-gakkyukai.com/api/cron/digest?week=2026-W36&force=1"
  ```

  応答は投稿できたとき `{"weekStart":"2026-08-31","posted":true,"id":"...","text":"..."}`、
  目印がある週は `{"posted":false,"reason":"already-posted"}`、
  Xの資格情報が無い環境は `{"posted":false,"reason":"x-not-configured","text":"..."}`。
  投稿に失敗したときは 500 と `{"posted":false,"error":"..."}` を返し、
  1回の実行につき1行を `console.log` に残す(Vercelのcronログで結果が読める)。
- 管理画面(`/admin`)の「週次のX投稿」に、前週と今週(進行中)の下書きが出る。
  下書きは画面を開くたびに数え直したもの。「前週分を今すぐ投稿する」で手動投稿でき、
  結果はその場に表示される。
- Xの資格情報(`X_API_KEY` ほか4つ)が未設定の環境では投稿せず、下書きの確認だけができる。

## テスト

```bash
npm test        # 純関数の単体テスト (node --test。Node 24が.tsの型を自前で剥がす)
npm run test:py # Pythonロジックのテスト (pytest)
```

対象は副作用のない純関数(`src/lib/` と `api/_logic.py` / `api/_embed_logic.py`)。
DBやNext.jsのレンダリングに依存する層はCIで再現しにくいので、Vercelのpreviewで確認する。

`tests/ts-resolver.mjs` は、拡張子なしの相対importと `@/` エイリアスを
tsconfigのpathsと同じように解決するためのフック(Node本体のESM解決は
どちらも扱えないため、テスト実行時だけ補う)。

## Pythonの依存

VercelのPythonビルダーは `requirements.txt` を見るため、`pyproject.toml` /
`uv.lock` は置かない(置くと解決方法が二重になる)。開発用の追加依存
(pytest)は `requirements-dev.txt` にまとめ、本番の `requirements.txt` を
`-r` で取り込む形にしてある。

## デプロイ

GitHub連携により `main` へのpushで本番へ自動デプロイされる(ブランチ/PRはpreview URL)。

## 環境変数

キーの一覧は [.env.example](./.env.example) にある。ローカルは `vercel env pull .env.local` で取得し、
`COMPUTE_URL` / `EMBED_URL` を手で足す。

| 変数 | 必須 | 用途 | 備考 |
| --- | --- | --- | --- |
| `DATABASE_URL` | Vercel/ローカル | Neon Postgres の接続文字列 | Neon統合が自動設定。`POSTGRES_*` / `PG*` のエイリアスは使わない |
| `HASH_SALT` | Vercel | cookie ID・IP のハッシュ化ソルト | 変更すると既存ハッシュと不整合 |
| `CRON_SECRET` | Vercel | Vercel Cron の Authorization ヘッダ | Vercelが自動生成 |
| `INTERNAL_API_KEY` | 任意 | Python Function を呼ぶ `X-Internal-Key` | 未設定なら `CRON_SECRET` を流用 |
| `ADMIN_KEY` | Vercel | `/admin` のアクセスキー | 未設定なら管理画面は無効。`/admin/login` から入力する |
| `TURNSTILE_SECRET_KEY` | Vercel | Turnstile の検証 | ローカルは未設定で公式テストキーに落ちる |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Vercel | Turnstile のサイトキー | ローカルは `1x00000000000000000000AA` |
| `NEXT_PUBLIC_SITE_URL` | 任意 | canonical・OGP・sitemap の生成 | 未設定なら本番ドメイン |
| `DISCORD_WEBHOOK_URL` | 任意 | 通報・問い合わせの運営通知 | 未設定なら通知しない |
| `X_API_KEY` | 任意 | X(旧Twitter)投稿のAPIキー | 4つ揃わなければ投稿せず下書きの確認のみ |
| `X_API_SECRET` | 任意 | 同上(シークレット) | ログには出さない |
| `X_ACCESS_TOKEN` | 任意 | 同上(運営アカウントのトークン) | Read and write 権限が必要 |
| `X_ACCESS_TOKEN_SECRET` | 任意 | 同上(トークンシークレット) | ログには出さない |
| `COMPUTE_URL` | ローカルのみ | クラスタリング計算の呼び出し先 | 本番は同一デプロイの `/api/compute` |
| `EMBED_URL` | ローカルのみ | 埋め込み生成の呼び出し先 | 本番は同一デプロイの `/api/embed` |
| `DEV_ALLOWED_ORIGINS` | ローカルのみ・任意 | 開発サーバーへのアクセスを許可するオリジン | カンマ区切り。LAN内の実機確認に使う |
| `VERCEL_SUPPORT_LARGE_FUNCTIONS=1` | Vercel | Python関数が225MB超のため必須 | Vercelプロジェクト設定側 |

`HASH_SALT` / `TURNSTILE_SECRET_KEY` / `CRON_SECRET` / `ADMIN_KEY` の4つは、
Vercel上(production/preview)では必須。未設定のまま開発用の既定値で動き続けないよう、
`src/lib/env.ts` がリクエスト時に例外を投げる(ローカルでは従来どおり既定値に落ちる)。

管理画面へは `/admin/login` でキーを入力してログインする(Cookieは30日で失効し、
それ以降は再ログインが必要)。移行期間中は従来の `/admin?key=<キー>` でも入れるが、
URLに鍵が残るため、フォームログインに慣れた時点で廃止する。

## ライセンス

コードは [MIT License](./LICENSE)。ただし以下はMITの対象外:

- `api/_model/` の埋め込みモデル(Apache-2.0の派生物)
- イラスト素材(Loose Drawing様の規約に従う。リポジトリ非同梱)

詳細は [docs/THIRD_PARTY_NOTICES.md](./docs/THIRD_PARTY_NOTICES.md) を参照。
