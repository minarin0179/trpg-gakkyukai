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
uv venv && uv pip install -r requirements.txt

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
- `src/app/actions.ts` — テーマ提案・意見投稿・投票・通報のServer Actions
- `src/lib/recompute.ts` — 投票後の再計算オーケストレーション(最短30分間隔。自分の点はクライアント側でライブ投影)
- `api/_logic.py` — red-dwarf呼び出し本体(エンドポイントから分離、単体テスト可)
- `src/app/api/cron/recompute/route.ts` — 日次バックストップ(vercel.json の crons)
- 参加者は匿名cookie(`gk_pid`)のみで識別。個人情報は保存しない

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
| `ADMIN_KEY` | Vercel | `/admin` のアクセスキー | 未設定なら管理画面は無効 |
| `TURNSTILE_SECRET_KEY` | Vercel | Turnstile の検証 | ローカルは未設定で公式テストキーに落ちる |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Vercel | Turnstile のサイトキー | ローカルは `1x00000000000000000000AA` |
| `NEXT_PUBLIC_SITE_URL` | 任意 | canonical・OGP・sitemap の生成 | 未設定なら本番ドメイン |
| `DISCORD_WEBHOOK_URL` | 任意 | 通報・問い合わせの運営通知 | 未設定なら通知しない |
| `COMPUTE_URL` | ローカルのみ | クラスタリング計算の呼び出し先 | 本番は同一デプロイの `/api/compute` |
| `EMBED_URL` | ローカルのみ | 埋め込み生成の呼び出し先 | 本番は同一デプロイの `/api/embed` |
| `VERCEL_SUPPORT_LARGE_FUNCTIONS=1` | Vercel | Python関数が225MB超のため必須 | Vercelプロジェクト設定側 |

`HASH_SALT` / `TURNSTILE_SECRET_KEY` / `CRON_SECRET` / `ADMIN_KEY` の4つは、
Vercel上(production/preview)では必須。未設定のまま開発用の既定値で動き続けないよう、
`src/lib/env.ts` がリクエスト時に例外を投げる(ローカルでは従来どおり既定値に落ちる)。

## ライセンス

コードは [MIT License](./LICENSE)。ただし以下はMITの対象外:

- `api/_model/` の埋め込みモデル(Apache-2.0の派生物)
- イラスト素材(Loose Drawing様の規約に従う。リポジトリ非同梱)

詳細は [docs/THIRD_PARTY_NOTICES.md](./docs/THIRD_PARTY_NOTICES.md) を参照。
