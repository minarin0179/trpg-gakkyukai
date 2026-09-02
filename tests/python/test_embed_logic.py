"""embed_texts の回帰テスト。

モデル(api/_model)はリポジトリに同梱されているので、追加のダウンロードなしに
CIでもそのまま走る。onnxruntime が入っていない環境ではモジュールごとskipする。
"""

import pytest

ort = pytest.importorskip("onnxruntime", reason="onnxruntime未導入の環境ではskip")

from api._embed_logic import DIMENSIONS, MAX_TEXTS, embed_texts  # noqa: E402


def test_returns_normalized_vectors():
    vectors = embed_texts(["卓のBGM", "セッションの遅刻"])
    assert len(vectors) == 2
    for v in vectors:
        assert len(v) == DIMENSIONS
        # L2正規化済み(内積=コサイン類似度)であることが pgvector の <=> と
        # 閾値(config.ts の THEME_SIMILAR_THRESHOLD 等)の前提になっている。
        # 出力は小数6桁に丸めているので厳密には1.0にならない
        norm = sum(x * x for x in v) ** 0.5
        assert abs(norm - 1.0) < 1e-3


def test_different_texts_give_different_vectors():
    a, b = embed_texts(["卓のBGM", "セッションの遅刻"])
    assert a != b


@pytest.mark.parametrize(
    "texts",
    [
        [],
        None,
        "卓のBGM",  # listでない
        [1, 2],
        ["  "],  # 空白のみ
        ["x"] * (MAX_TEXTS + 1),
    ],
)
def test_invalid_input_raises_value_error(texts):
    with pytest.raises(ValueError):
        embed_texts(texts)
