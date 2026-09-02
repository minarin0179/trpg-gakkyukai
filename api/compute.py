"""Vercel Python Function: クラスタリング計算エンドポイント。

内部呼び出し専用。X-Internal-Key ヘッダが INTERNAL_API_KEY
(未設定なら CRON_SECRET)と一致しないリクエストは拒否する
(計算リソースの悪用防止)。
"""

from http.server import BaseHTTPRequestHandler

from api._http import authorized, log_exception, read_json, respond
from api._logic import compute_clusters


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if not authorized(self.headers):
            respond(self, 401, {"error": "unauthorized"})
            return

        try:
            payload = read_json(self)
            respond(self, 200, compute_clusters(payload))
        except ValueError as e:
            # 入力の不備は呼び出し側で直せるので理由を返す
            respond(self, 400, {"error": str(e)})
        except Exception:  # noqa: BLE001
            # 内部事情(ライブラリの例外文など)は外に出さず、ログにだけ残す
            log_exception()
            respond(self, 500, {"error": "internal error"})
