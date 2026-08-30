"""Vercel Python Function: テキスト埋め込みエンドポイント。

内部呼び出し専用。compute.py と同じく X-Internal-Key ヘッダが
CRON_SECRET と一致しないリクエストは拒否する。

POST {"texts": ["...", ...]} -> {"vectors": [[256次元], ...]}
"""

import json
import os
from http.server import BaseHTTPRequestHandler

from api._embed_logic import embed_texts


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        secret = os.environ.get("CRON_SECRET", "")
        provided = self.headers.get("X-Internal-Key", "")
        if not secret or provided != secret:
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
