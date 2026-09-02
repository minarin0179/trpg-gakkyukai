"""compute_clusters の回帰テスト。

数値そのものではなく「2つの意見グループが分かれること」「出力の形が
崩れないこと」を確認する。座標の厳密比較はred-dwarf側の実装変更で
すぐ壊れるうえ、壊れても製品としては問題ないため。
"""

import random

import pytest

from api._logic import compute_clusters

N_PARTICIPANTS = 40
N_STATEMENTS = 12
NOISE_RATE = 0.1


def build_votes(
    n_participants: int = N_PARTICIPANTS,
    n_statements: int = N_STATEMENTS,
    noise_rate: float = NOISE_RATE,
) -> list[dict]:
    """2グループに割れる合成投票を作る。

    前半の参加者は意見0-5に賛成・6-11に反対、後半はその逆。
    現実のデータに近づけるため一定割合で票を反転させる(シード固定で再現可能)。
    """
    rng = random.Random(0)
    votes = []
    modified = 0
    for pid in range(n_participants):
        first_half = pid < n_participants // 2
        for sid in range(n_statements):
            agrees_low = sid < n_statements // 2
            vote = 1 if agrees_low == first_half else -1
            if rng.random() < noise_rate:
                vote = -vote
            modified += 1
            votes.append(
                {
                    "participant_id": pid,
                    "statement_id": sid,
                    "vote": vote,
                    "modified": modified,
                }
            )
    return votes


@pytest.fixture(scope="module")
def result() -> dict:
    return compute_clusters(
        {"votes": build_votes(), "statement_count": N_STATEMENTS}
    )


def test_status_and_shape(result: dict):
    assert result["status"] == "ok"
    assert 2 <= result["group_count"] <= 5
    assert len(result["participants"]) == N_PARTICIPANTS
    for p in result["participants"]:
        assert isinstance(p["x"], float)
        assert isinstance(p["y"], float)
        assert "cluster" in p
    assert len(result["statement_priorities"]) == N_STATEMENTS
    assert result["projection"]["n_statements"] == N_STATEMENTS
    assert result["repness"]


def test_two_groups_are_separated(result: dict):
    """前半・後半の参加者が別々のクラスタにまとまること。

    ラベルの番号は実装依存なので、各半分の最頻ラベルが異なることと、
    その純度が8割以上あることだけを見る(座標のスナップショットは取らない)。
    """
    clusters = {p["id"]: p["cluster"] for p in result["participants"]}
    half = N_PARTICIPANTS // 2

    def majority(ids: range) -> tuple[int | None, float]:
        labels = [clusters[i] for i in ids if clusters[i] is not None]
        assert labels, "クラスタに割り当てられた参加者がいない"
        top = max(set(labels), key=labels.count)
        return top, labels.count(top) / len(labels)

    first_label, first_purity = majority(range(half))
    second_label, second_purity = majority(range(half, N_PARTICIPANTS))

    assert first_label != second_label
    assert first_purity >= 0.8
    assert second_purity >= 0.8


def test_insufficient_when_below_thresholds():
    """データ不足のときは例外ではなく status=insufficient を返すこと。

    境界は _logic.py の「参加者3人未満 / 意見2件未満 / 総票数6未満」。
    3人はこの境界の内側(=計算が走る)なので、2人で確認する。
    """
    two = build_votes(n_participants=2, n_statements=N_STATEMENTS)
    assert compute_clusters({"votes": two, "statement_count": N_STATEMENTS})["status"] == (
        "insufficient"
    )

    # 意見が1件しかない場合(参加者は足りている)
    one_statement = build_votes(n_participants=N_PARTICIPANTS, n_statements=1)
    assert compute_clusters({"votes": one_statement, "statement_count": 1})["status"] == (
        "insufficient"
    )


def test_three_participants_still_computes():
    """境界のすぐ内側(3人)は計算が走り、例外にならないこと"""
    votes = build_votes(n_participants=3, n_statements=N_STATEMENTS)
    result = compute_clusters({"votes": votes, "statement_count": N_STATEMENTS})
    assert result["status"] == "ok"
    assert len(result["participants"]) == 3


@pytest.mark.parametrize(
    "payload",
    [
        None,
        {},
        {"votes": "not a list"},
        {"votes": [[1, 2]], "statement_count": 2},
        {"votes": [{"participant_id": "a", "statement_id": 1, "vote": 1, "modified": 0}]},
        {"votes": [{"participant_id": 1, "statement_id": 1, "vote": 2, "modified": 0}]},
        {"votes": [{"participant_id": 1, "statement_id": 1, "vote": 1}]},
        {"votes": [], "statement_count": -1},
        {"votes": [], "statement_count": 2, "mod_out_statement_ids": ["1"]},
    ],
)
def test_invalid_payload_raises_value_error(payload):
    with pytest.raises(ValueError):
        compute_clusters(payload)
