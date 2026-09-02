#!/usr/bin/env bash
# Codespaces / Dev Container の初回セットアップ。
#
# やること(上から順に。失敗しても後続を止めない項目は || で受ける):
#   1. Node / Python の依存、Playwright(Chromium)、CLI(vercel / neonctl)
#   2. イラスト素材の取得(リポジトリ非同梱)
#   3. .env.local の生成
#        VERCEL_TOKEN あり → vercel env pull(開発用の環境変数)
#        なし            → .env.example から開発既定値を生成
#   4. DATABASE_URL の決定(本番DBには絶対に向けない)
#        NEON_API_KEY あり → 本番のコピーを Neon ブランチとして作成/再利用
#        なし              → 使い捨ての Claimable Postgres(72時間)を作成
#      その後 db:migrate と seed
#   5. Next の型生成
#
# 再実行しても安全(既存の .env.local や venv は作り直さない)。
set -uo pipefail
cd "$(dirname "$0")/.."

log()  { printf '\n\033[1;36m[post-create]\033[0m %s\n' "$*"; }
warn() { printf '\n\033[1;33m[post-create] 注意:\033[0m %s\n' "$*"; }

# .env.local のキーを追記/更新する(値に & や / が入っても壊れないよう sed は使わない)
set_env() {
  local key="$1" value="$2" file=".env.local"
  touch "$file"
  if grep -q "^${key}=" "$file"; then
    node -e '
      const [file, key, value] = process.argv.slice(1);
      const fs = require("fs");
      const lines = fs.readFileSync(file, "utf8").split("\n");
      const out = lines.map((l) => (l.startsWith(key + "=") ? `${key}=${value}` : l));
      fs.writeFileSync(file, out.join("\n"));
    ' "$file" "$key" "$value"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

env_get() { grep -E "^$1=" .env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'; }

# ---------------------------------------------------------------- 1. 依存
log "npm ci"
npm ci

log "Python venv (uv) + requirements-dev.txt"
if [ ! -d .venv ]; then uv venv --python 3.12 .venv; fi
uv pip install --python .venv/bin/python -r requirements-dev.txt

log "Playwright Chromium(スクリーンショット・E2E用。数分かかる)"
npx playwright install --with-deps chromium || warn "Playwright のインストールに失敗。scripts/screenshot.mjs 等は使えない"

log "CLI: vercel / neonctl"
npm install -g vercel@latest neonctl@latest >/dev/null 2>&1 || warn "vercel / neonctl のグローバルインストールに失敗"

# ---------------------------------------------------------------- 2. 素材
log "イラスト素材の取得(Loose Drawing 公式サイトから)"
npm run setup:assets || warn "イラストの取得に失敗(表示は崩れるが開発は続けられる。後で npm run setup:assets)"

# ---------------------------------------------------------------- 3. .env.local
if [ -f .env.local ]; then
  log ".env.local は既にあるので生成をスキップ"
elif [ -n "${VERCEL_TOKEN:-}" ]; then
  log "vercel env pull(VERCEL_TOKEN あり)"
  # プロジェクト名/チームは環境変数で上書き可能(フォークで自分の Vercel に繋ぐ場合)
  vercel link --yes --project "${VERCEL_PROJECT:-trpg-gakkyukai}" --team "${VERCEL_TEAM:-yukito-minaris-projects}" --token "$VERCEL_TOKEN" \
    && vercel env pull .env.local --environment development --yes --token "$VERCEL_TOKEN" \
    || warn "vercel env pull に失敗。.env.example から生成する"
fi
if [ ! -f .env.local ]; then
  log ".env.example から開発用の .env.local を生成"
  cp .env.example .env.local
  set_env HASH_SALT "dev-$(head -c 12 /dev/urandom | base64 | tr -dc a-z0-9)"
  set_env CRON_SECRET "dev-cron-secret"
  set_env ADMIN_KEY "dev-admin"
fi

# ローカル専用の値。vercel env pull では入ってこないので常に補う
set_env COMPUTE_URL "http://localhost:8787"
set_env EMBED_URL "http://localhost:8787/embed"
[ -n "$(env_get NEXT_PUBLIC_TURNSTILE_SITE_KEY)" ] || set_env NEXT_PUBLIC_TURNSTILE_SITE_KEY "1x00000000000000000000AA"
# Codespaces の転送ドメイン(https://<name>-3000.app.github.dev)からの dev アクセスを許可する
if [ -n "${CODESPACE_NAME:-}" ] && [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]; then
  set_env DEV_ALLOWED_ORIGINS "${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
fi

# ---------------------------------------------------------------- 4. DATABASE_URL
# vercel env pull の DATABASE_URL は本番DBなので、開発用に必ず差し替える。
# 差し替えに失敗したときは空にして、本番へ書き込めない状態に倒す。
CURRENT_DB="$(env_get DATABASE_URL)"
DB_READY=0

neon_branch_db() {
  # 本番DBのコピーを Neon ブランチとして用意する(Codespace ごとに1本、30日で自動失効)
  local project_id="${NEON_PROJECT_ID:-$(env_get NEON_PROJECT_ID)}"
  if [ -z "$project_id" ]; then warn "NEON_PROJECT_ID が無いのでブランチを作れない"; return 1; fi
  local name="cs-${CODESPACE_NAME:-local-$(hostname)}"
  name="${name:0:60}"
  local existing
  existing="$(neonctl branches list --project-id "$project_id" --api-key "$NEON_API_KEY" -o json 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s||"[]");const b=a.find(x=>x.name===process.argv[1]);process.stdout.write(b?b.id:"")})' "$name")"
  if [ -z "$existing" ]; then
    log "Neon ブランチ $name を作成(親: 本番、30日で失効)"
    local expires
    expires="$(date -u -d '+30 days' +%Y-%m-%dT%H:%M:%SZ)"
    neonctl branches create --project-id "$project_id" --api-key "$NEON_API_KEY" --name "$name" --expires-at "$expires" -o json >/dev/null || return 1
  else
    log "Neon ブランチ $name を再利用"
  fi
  local url
  url="$(neonctl connection-string "$name" --project-id "$project_id" --api-key "$NEON_API_KEY" --pooled 2>/dev/null)"
  [ -n "$url" ] || return 1
  set_env DATABASE_URL "$url"
}

claimable_db() {
  # Neon アカウント不要の使い捨てDB(72時間で消える。claim すれば自分のアカウントに移せる)
  local tmp
  tmp="$(mktemp -d)"
  ( cd "$tmp" && neonctl claim create --env-pull >/dev/null 2>&1 ) || return 1
  local url
  url="$(grep -E '^DATABASE_URL=' "$tmp/.env" | head -1 | cut -d= -f2- | tr -d '"')"
  [ -n "$url" ] || return 1
  set_env DATABASE_URL "$url"
  set_env DATABASE_CLAIM_NOTE "使い捨てDB(72時間)。残したい場合は neonctl claim accept --no-open で claim URL を表示"
}

if [ -n "${NEON_API_KEY:-}" ]; then
  neon_branch_db && DB_READY=1 || warn "Neon ブランチの作成に失敗"
fi
if [ "$DB_READY" = 0 ]; then
  log "Claimable Postgres(使い捨てDB)を作成"
  claimable_db && DB_READY=1 || warn "Claimable Postgres の作成に失敗"
fi

if [ "$DB_READY" = 1 ]; then
  if [ -n "$CURRENT_DB" ] && [ "$CURRENT_DB" = "$(env_get DATABASE_URL)" ]; then
    warn "DATABASE_URL が差し替わっていない(本番の可能性)。安全のため空にする"
    set_env DATABASE_URL ""
  else
    log "db:migrate(スキーマ適用)"
    if npm run db:migrate; then
      # 本番コピーのブランチにはデータがあるので、空のDB(使い捨て)にだけ seed を入れる
      if [ -z "${NEON_API_KEY:-}" ]; then
        log "seed(テストデータ)"
        node --env-file=.env.local scripts/seed.mjs || warn "seed に失敗"
      fi
    else
      warn "db:migrate に失敗。DATABASE_URL を確認して npm run db:migrate を再実行"
    fi
  fi
else
  # 本番に向いたままにしない
  set_env DATABASE_URL ""
  warn "DATABASE_URL を空にした。README の「Codespaces」を見て手動で設定する"
fi

# ---------------------------------------------------------------- 5. 型生成
log "next typegen"
npx next typegen >/dev/null 2>&1 || true

log "完了。起動: npm run dev:all(計算サーバー + Next.js)。DB: $( [ "$DB_READY" = 1 ] && echo OK || echo 未設定 )"
