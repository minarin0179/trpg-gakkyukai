#!/usr/bin/env bash
# 開発に必要な2プロセス(計算サーバー + Next.js)をまとめて起動する。
# どちらかが落ちたら両方止める。Ctrl+C で両方終了。
set -euo pipefail
cd "$(dirname "$0")/.."
trap 'kill 0' EXIT INT TERM
npm run compute:dev &
npm run dev &
wait -n
