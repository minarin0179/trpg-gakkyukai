"""Vercel Python Function: テキスト埋め込みエンドポイント。

内部呼び出し専用。compute.py と同じく X-Internal-Key ヘッダが
INTERNAL_API_KEY(未設定なら CRON_SECRET)と一致しないリクエストは拒否する。

POST {"texts": ["...", ...]} -> {"vectors": [[256次元], ...]}
"""

import hmac
import json
import os
from http.server import BaseHTTPRequestHandler

from api._embed_logic import embed_texts


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # INTERNAL_API_KEY を優先。未設定の間は CRON_SECRET を流用する
        secret = os.environ.get("INTERNAL_API_KEY") or os.environ.get("CRON_SECRET", "")
        provided = self.headers.get("X-Internal-Key", "")
        # 比較時間から鍵を推測されないよう定数時間比較を使う。
        # ヘッダに非ASCIIが来ると str 同士の compare_digest は TypeError になるため
        # バイト列に落としてから比較する
        if not secret or not hmac.compare_digest(
            provided.encode("utf-8"), secret.encode("utf-8")
        ):
            self._respond(401, {"error": "unauthorized"})
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length))
            vectors = embed_texts(payload.get("texts"))
            self._respond(200, {"vectors": vectors})
        except ValueError as e:
            self._respond(400, {"error": str(e)})
        except Exception as e:  # noqa: BLE001
            self._respond(500, {"error": str(e)})

    def _respond(self, status: int, body: dict):
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
