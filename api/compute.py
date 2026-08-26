"""Vercel Python Function: クラスタリング計算エンドポイント。

内部呼び出し専用。X-Internal-Key ヘッダが CRON_SECRET と一致しない
リクエストは拒否する(計算リソースの悪用防止)。
"""

import json
import os
from http.server import BaseHTTPRequestHandler

from api._logic import compute_clusters


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
            result = compute_clusters(payload)
            self._respond(200, result)
        except Exception as e:  # noqa: BLE001
            self._respond(500, {"error": str(e)})

    def _respond(self, status: int, body: dict):
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
