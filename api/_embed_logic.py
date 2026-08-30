"""テキスト埋め込みの本体。

ruri-v3-30m (ONNX int8量子化, 256次元, Apache-2.0) をCPUで動かす。
類似テーマ検出用: プレフィックスなし入力=意味の類似エンコード(Ruri v3の規約)。
モデル・tokenizerは api/_model/ に同梱(外部ダウンロードなしでコールドスタート可能)。

エンドポイント(embed.py)から分離してあるのは _logic.py と同じ理由
(ローカルテストと将来の移設を容易にするため)。
"""

import os

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

_MODEL_DIR = os.path.join(os.path.dirname(__file__), "_model")

# 1リクエストで受けるテキスト数の上限(バックフィルのバッチがこの単位)
MAX_TEXTS = 100
DIMENSIONS = 256

_tokenizer: Tokenizer | None = None
_session: ort.InferenceSession | None = None


def _load() -> tuple[Tokenizer, ort.InferenceSession]:
    """モデルを遅延ロードし、ウォームなインスタンスでは再利用する"""
    global _tokenizer, _session
    if _session is None or _tokenizer is None:
        tok = Tokenizer.from_file(os.path.join(_MODEL_DIR, "tokenizer.json"))
        tok.enable_padding()
        tok.enable_truncation(max_length=512)
        _tokenizer = tok
        _session = ort.InferenceSession(
            os.path.join(_MODEL_DIR, "model_int8.onnx"),
            providers=["CPUExecutionProvider"],
        )
    return _tokenizer, _session


def embed_texts(texts: list[str]) -> list[list[float]]:
    """テキスト群をL2正規化済み256次元ベクトルにする。

    正規化済みなので内積=コサイン類似度、pgvectorの <=> (コサイン距離)とも整合する。
    """
    if not isinstance(texts, list) or not texts:
        raise ValueError("texts must be a non-empty list")
    if len(texts) > MAX_TEXTS:
        raise ValueError(f"too many texts (max {MAX_TEXTS})")
    if not all(isinstance(t, str) and t.strip() for t in texts):
        raise ValueError("texts must be non-empty strings")

    tok, sess = _load()
    enc = tok.encode_batch(texts)
    ids = np.array([e.ids for e in enc], dtype=np.int64)
    mask = np.array([e.attention_mask for e in enc], dtype=np.int64)
    out = sess.run(None, {"input_ids": ids, "attention_mask": mask})[0]
    # mean pooling (本家1_Pooling/config.jsonの設定と同じ) + L2正規化
    m = mask[..., None].astype(np.float32)
    emb = (out * m).sum(axis=1) / np.clip(m.sum(axis=1), 1e-9, None)
    emb /= np.clip(np.linalg.norm(emb, axis=1, keepdims=True), 1e-9, None)
    return [[round(float(x), 6) for x in row] for row in emb]
