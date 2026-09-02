"""Vercel Python Function: テキスト埋め込みエンドポイント。

内部呼び出し専用。compute.py と同じく X-Internal-Key ヘッダが
INTERNAL_API_KEY(未設定なら CRON_SECRET)と一致しないリクエストは拒否する。

POST {"texts": ["...", ...]} -> {"vectors": [[256次元], ...]}
"""

from http.server import BaseHTTPRequestHandler

from api._embed_logic import embed_texts
from api._http import authorized, log_exception, read_json, respond


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if not authorized(self.headers):
            respond(self, 401, {"error": "unauthorized"})
            return

        try:
            payload = read_json(self)
            if not isinstance(payload, dict):
                raise ValueError("payload must be an object")
            respond(self, 200, {"vectors": embed_texts(payload.get("texts"))})
        except ValueError as e:
            # 入力の不備は呼び出し側で直せるので理由を返す
            respond(self, 400, {"error": str(e)})
        except Exception:  # noqa: BLE001
            # 内部事情(モデルのロード失敗など)は外に出さず、ログにだけ残す
            log_exception()
            respond(self, 500, {"error": "internal error"})
