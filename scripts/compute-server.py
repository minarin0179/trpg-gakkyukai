"""ローカル開発用の計算サーバー(クラスタリング+埋め込み)。

本番ではVercelのPython Function(api/compute.py, api/embed.py)が担う処理を、
`next dev` と並走するローカルサーバーとして提供する。

使い方:
    uv run python scripts/compute-server.py
    # .env.local に以下を設定
    #   COMPUTE_URL=http://localhost:8787
    #   EMBED_URL=http://localhost:8787/embed
"""

import os
import sys
import traceback
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# sys.path を通したあとで本番と同じHTTP層を読み込む(応答形式をそろえるため)。
# 認証はローカル専用サーバーなので行わない
from api._http import read_json, respond  # noqa: E402

PORT = 8787


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            payload = read_json(self)
            # 依存を持たない側の用途を壊さないよう、ルートごとに遅延importする
            # (例: red-dwarf未導入でも/embedは動く)
            if self.path.rstrip("/") == "/embed":
                from api._embed_logic import embed_texts  # noqa: PLC0415

                result = {"vectors": embed_texts(payload.get("texts"))}
            else:
                from api._logic import compute_clusters  # noqa: PLC0415

                result = compute_clusters(payload)
            respond(self, 200, result)
        except ValueError as e:
            respond(self, 400, {"error": str(e)})
        except Exception as e:  # noqa: BLE001
            # ローカル開発では原因がすぐ分かるほうが有用なので例外文をそのまま返す
            traceback.print_exc()
            respond(self, 500, {"error": str(e)})

    def log_message(self, fmt, *args):
        print(f"[compute] {fmt % args}")


if __name__ == "__main__":
    print(f"compute server listening on http://localhost:{PORT}")
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
