"""ローカル開発用のクラスタリング計算サーバー。

本番ではVercelのPython Function(api/compute.py)が担う処理を、
`next dev` と並走するローカルサーバーとして提供する。

使い方:
    uv run python scripts/compute-server.py
    # .env.local に COMPUTE_URL=http://localhost:8787 を設定
"""

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from api._logic import compute_clusters  # noqa: E402

PORT = 8787


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length))
            result = compute_clusters(payload)
            body = json.dumps(result).encode()
            self.send_response(200)
        except Exception as e:  # noqa: BLE001
            body = json.dumps({"error": str(e)}).encode()
            self.send_response(500)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print(f"[compute] {fmt % args}")


if __name__ == "__main__":
    print(f"compute server listening on http://localhost:{PORT}")
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
