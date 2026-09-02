"""Python Function 共通のHTTP層。

compute.py / embed.py で重複していた認証・JSON読み取り・応答生成をまとめる。
ローカルの scripts/compute-server.py も read_json / respond を共用する
(認証はローカルでは不要なので authorized は使わない)。
"""

import hmac
import json
import os
import sys
import traceback
from typing import Any

# リクエストボディの上限。埋め込みは最大100件のテキスト、計算は1テーマ分の
# 投票なので、これを超える入力は誤りか攻撃とみなして読まずに弾く
MAX_BODY_BYTES = 32 * 1024 * 1024


def authorized(headers) -> bool:
    """X-Internal-Key ヘッダが内部鍵と一致するか。

    INTERNAL_API_KEY を優先し、未設定の間は CRON_SECRET を流用する。
    比較時間から鍵を推測されないよう定数時間比較を使う。
    ヘッダに非ASCIIが来ると str 同士の compare_digest は TypeError になるため
    バイト列に落としてから比較する。
    """
    secret = os.environ.get("INTERNAL_API_KEY") or os.environ.get("CRON_SECRET", "")
    provided = headers.get("X-Internal-Key", "") or ""
    if not secret:
        return False
    return hmac.compare_digest(provided.encode("utf-8"), secret.encode("utf-8"))


def read_json(handler) -> Any:
    """Content-Length のぶんだけボディを読み、JSONとして解釈する。

    壊れた入力は呼び出し側の責任(400)なので ValueError にそろえる。
    """
    raw_length = handler.headers.get("Content-Length", 0)
    try:
        length = int(raw_length)
    except (TypeError, ValueError):
        raise ValueError("invalid Content-Length") from None
    if length < 0 or length > MAX_BODY_BYTES:
        raise ValueError("request body too large")
    body = handler.rfile.read(length)
    try:
        return json.loads(body)
    except json.JSONDecodeError as e:
        raise ValueError(f"invalid JSON body: {e.msg}") from None


def respond(handler, status: int, body: Any) -> None:
    data = json.dumps(body).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


def log_exception() -> None:
    """内部例外はログにだけ残す。

    例外文にはクエリやパスなど内部事情が混ざり得るので、呼び出し側へは
    固定文言(internal error)だけを返し、詳細はstderr(=Vercelのログ)に出す。
    """
    traceback.print_exc(file=sys.stderr)
