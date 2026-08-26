"""クラスタリング計算の本体。

red-dwarf (Polis準拠の再実装, MPL 2.0) をデフォルトパラメータで呼び出す。
エンドポイント(compute.py)から分離してあるのは、ローカルでの直接テストと
将来の移設(別ホスティングへの切り出し)を容易にするため。
"""

from reddwarf.implementations.polis import run_pipeline

# Polis標準は7票未満の参加者をマップから除外する(min_user_vote_threshold=7)。
# ただし意見が7件未満の小さな会話では誰も7票に到達できないため、
# 「可視の意見数」まで閾値を下げる。意見が7件以上あれば本家標準のまま。
POLIS_MIN_VOTE_THRESHOLD = 7

# 再現性の担保: 乱数シードを固定し、同じ投票データから常に同じマップを生成する
RANDOM_STATE = 42


def compute_clusters(payload: dict) -> dict:
    """payload:
      votes: [{participant_id:int, statement_id:int, vote:int(-1|0|1), modified:int}]
      statement_count: int  可視の意見数
      mod_out_statement_ids: [int]  削除済み意見(計算から除外)
    """
    votes = payload["votes"]
    statement_count = payload.get("statement_count", 0)
    mod_out = payload.get("mod_out_statement_ids", [])

    n_participants = len({v["participant_id"] for v in votes})
    if n_participants < 3 or statement_count < 2 or len(votes) < 6:
        return {"status": "insufficient", "reason": "not enough votes to build a map"}

    threshold = min(POLIS_MIN_VOTE_THRESHOLD, statement_count)

    result = run_pipeline(
        votes=votes,
        mod_out_statement_ids=mod_out,
        min_user_vote_threshold=threshold,
        random_state=RANDOM_STATE,
    )

    participants = []
    for pid, row in result.participants_df.iterrows():
        cluster = row.get("cluster_id")
        participants.append(
            {
                "id": int(pid),
                "x": round(float(row["x"]), 4),
                "y": round(float(row["y"]), 4),
                "cluster": int(cluster) if cluster is not None and cluster == cluster else None,
            }
        )

    clustered = [p for p in participants if p["cluster"] is not None]
    group_count = len({p["cluster"] for p in clustered})

    def serialize_consensus(items):
        out = []
        for s in items or []:
            out.append(
                {
                    "statement_id": int(s["tid"]) if "tid" in s else int(s.get("statement_id", -1)),
                    "agree_ratio": s.get("n-success", 0) / s["n-trials"] if s.get("n-trials") else None,
                }
            )
        return out

    consensus = {
        "agree": serialize_consensus(result.consensus.get("agree")),
        "disagree": serialize_consensus(result.consensus.get("disagree")),
    }

    # グループごとの代表的意見 (repness)
    repness = {}
    for gid, statements in (result.repness or {}).items():
        repness[str(gid)] = [
            {
                "statement_id": int(s["tid"]),
                "repful_for": s.get("repful-for"),
            }
            for s in statements
        ]

    return {
        "status": "ok",
        "threshold_used": threshold,
        "group_count": group_count,
        "participants": participants,
        "consensus": consensus,
        "repness": repness,
    }
