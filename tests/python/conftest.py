"""テストからリポジトリルートをimport可能にする。

api/compute.py が `from api._logic import ...` と書くのに合わせ、
ルートを sys.path に入れて同じ形でimportできるようにする。
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
