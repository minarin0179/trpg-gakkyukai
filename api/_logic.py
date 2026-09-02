"""クラスタリング計算の本体。

red-dwarf (Polis準拠の再実装, MPL 2.0) をデフォルトパラメータで呼び出す。
エンドポイント(compute.py)から分離してあるのは、ローカルでの直接テストと
将来の移設(別ホスティングへの切り出し)を容易にするため。
"""

from collections import Counter
from typing import Any, NotRequired, TypedDict

import pandas as pd

from reddwarf.implementations.polis import run_pipeline

# Polis標準は7票未満の参加者をマップから除外する(min_user_vote_threshold=7)。
# ただし意見が7件未満の小さな会話では誰も7票に到達できないため、
# 「可視の意見数」まで閾値を下げる。意見が7件以上あれば本家標準のまま。
POLIS_MIN_VOTE_THRESHOLD = 7

# 本家Polis準拠: クラスタ対象がこの人数に満たなければ、投票数の多い参加者から
# 順にここまで繰り上げる(少数しか閾値を満たさない会話でもグループ分けを成立させる)
MIN_CLUSTERABLE_PARTICIPANTS = 15

# 再現性の担保: 乱数シードを固定し、同じ投票データから常に同じマップを生成する
RANDOM_STATE = 42


class VoteRow(TypedDict):
    """1票。red-dwarf の run_pipeline がそのまま受け取る形"""

    participant_id: int
    statement_id: int
    vote: int  # -1 | 0 | 1
    modified: int  # 更新時刻(同一参加者×意見の最新票の判定に使う)


class ComputePayload(TypedDict):
    votes: list[VoteRow]
    statement_count: int  # 可視の意見数
    mod_out_statement_ids: NotRequired[list[int]]  # 削除済み意見(計算から除外)


def _validate(payload: Any) -> ComputePayload:
    """入口で形を検証する。

    壊れた入力は red-dwarf の内部で分かりにくい例外(KeyError等)になり、
    500として扱われてしまう。呼び出し側で直せる不備なので ValueError
    (=エンドポイントでは400)に寄せておく。
    """
    if not isinstance(payload, dict):
        raise ValueError("payload must be an object")

    votes = payload.get("votes")
    if not isinstance(votes, list):
        raise ValueError("votes must be a list")
    for i, v in enumerate(votes):
        if not isinstance(v, dict):
            raise ValueError(f"votes[{i}] must be an object")
        # bool は int のサブクラスなので明示的に除く
        for key in ("participant_id", "statement_id", "modified"):
            value = v.get(key)
            if not isinstance(value, int) or isinstance(value, bool):
                raise ValueError(f"votes[{i}].{key} must be an int")
        if v.get("vote") not in (-1, 0, 1) or isinstance(v.get("vote"), bool):
            raise ValueError(f"votes[{i}].vote must be -1, 0 or 1")

    statement_count = payload.get("statement_count", 0)
    if (
        not isinstance(statement_count, int)
        or isinstance(statement_count, bool)
        or statement_count < 0
    ):
        raise ValueError("statement_count must be a non-negative int")

    mod_out = payload.get("mod_out_statement_ids", [])
    if not isinstance(mod_out, list) or not all(
        isinstance(x, int) and not isinstance(x, bool) for x in mod_out
    ):
        raise ValueError("mod_out_statement_ids must be a list of ints")

    return {
        "votes": votes,
        "statement_count": statement_count,
        "mod_out_statement_ids": mod_out,
    }


def compute_clusters(payload: Any) -> dict[str, Any]:
    """payload:
      votes: [{participant_id:int, statement_id:int, vote:int(-1|0|1), modified:int}]
      statement_count: int  可視の意見数
      mod_out_statement_ids: [int]  削除済み意見(計算から除外)
    """
    validated = _validate(payload)
    votes = validated["votes"]
    statement_count = validated["statement_count"]
    mod_out = validated["mod_out_statement_ids"]

    n_participants = len({v["participant_id"] for v in votes})
    if n_participants < 3 or statement_count < 2 or len(votes) < 6:
        return {"status": "insufficient", "reason": "not enough votes to build a map"}

    threshold = min(POLIS_MIN_VOTE_THRESHOLD, statement_count)

    # 本家Polis準拠の下限ルール: 閾値を満たす参加者が15人未満なら、投票数の多い
    # 参加者から順に15人まで繰り上げてクラスタ対象に含める(conversation.clj と同じ)。
    # 意見が後から増えて「全件投票」を満たす人が激減したテーマなどで、
    # クラスタリングが1〜2人になって失敗するのを防ぐ
    vote_counts = Counter(v["participant_id"] for v in votes)
    clusterable = [p for p, c in vote_counts.items() if c >= threshold]
    keep_ids = []
    if len(clusterable) < MIN_CLUSTERABLE_PARTICIPANTS:
        keep_ids = [p for p, _ in vote_counts.most_common(MIN_CLUSTERABLE_PARTICIPANTS)]

    # それでも投票パターンの種類が乏しくグループ数の自動探索が失敗する場合は、
    # グループ数を固定して減らしながら再試行する
    result = None
    last_error: Exception | None = None
    for force_k in (None, 3, 2):
        try:
            result = run_pipeline(
                votes=votes,
                mod_out_statement_ids=mod_out,
                min_user_vote_threshold=threshold,
                keep_participant_ids=keep_ids,
                random_state=RANDOM_STATE,
                **({} if force_k is None else {"force_group_count": force_k}),
            )
            break
        except ValueError as e:
            last_error = e
            continue
    if result is None:
        raise RuntimeError(f"clustering failed even with reduced group counts: {last_error}")

    participants = []
    for pid, row in result.participants_df.iterrows():
        cluster = row.get("cluster_id")
        # 未クラスタの参加者は cluster_id が None / NaN / pd.NA になり得る。
        # pd.NA は `cluster == cluster` が真偽不定で例外になるため pd.isna で判定する。
        has_cluster = cluster is not None and not pd.isna(cluster)
        participants.append(
            {
                "id": int(pid),
                "x": round(float(row["x"]), 4),
                "y": round(float(row["y"]), 4),
                "cluster": int(cluster) if has_cluster else None,
            }
        )

    clustered = [p for p in participants if p["cluster"] is not None]
    group_count = len({p["cluster"] for p in clustered})

    def serialize_consensus(items: Any) -> list[dict[str, Any]]:
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
    #
    # red-dwarf(Polis準拠)は「有意な意見が無いグループにも最低1つ出す」フォールバックを
    # 持ち、さらに二標本比率検定+擬似カウント(スムージング)のため、極小グループでは
    # 「その方向に実票が0なのに repful-for に選ばれる」破綻が起きる。
    # 例: 全会一致で賛成(反対票0)の意見が、あるグループで repful-for=disagree として出る。
    # そこで、主張された方向(賛成/反対)にそのグループの実票が1つも無い項目(n-success<=0)は
    # 除外する。これで矛盾表示を防ぎつつ、実際に少数が反対/賛成している項目は残る。
    repness = {}
    for gid, statements in (result.repness or {}).items():
        kept = [
            {
                "statement_id": int(s["tid"]),
                "repful_for": s.get("repful-for"),
            }
            for s in statements
            if int(s.get("n-success", 0)) > 0
        ]
        if kept:
            repness[str(gid)] = kept

    # 意見の提示優先度(本家Polisのcomment priority)。
    # 重要度(賛成率×関与率×(1+極性))×新規ブースト(票が少ないほど最大9倍)の二乗。
    # 投票デッキがこの値に比例した重み付き抽選で提示順を決める
    statement_priorities = {}
    if "priority" in result.statements_df.columns:
        for pid, row in result.statements_df.iterrows():
            if not pd.isna(row["priority"]):
                statement_priorities[int(pid)] = round(float(row["priority"]), 4)

    # 自分の点のライブ投影用の材料(本家Polisクライアントと同じ方式)。
    # 参加者座標 = sqrt(全意見数 / 本人の投票数) × Σ_投票済み (票 - mean) × (pc1, pc2)
    # これをクライアントへ渡すと、再計算を待たずに自分の点を投票のたびに動かせる
    projection_statements = {}
    cols = result.statements_df.columns
    if all(c in cols for c in ("pc1", "pc2", "mean")):
        for tid, row in result.statements_df.iterrows():
            if pd.isna(row["pc1"]) or pd.isna(row["pc2"]) or pd.isna(row["mean"]):
                continue
            projection_statements[int(tid)] = [
                round(float(row["pc1"]), 5),
                round(float(row["pc2"]), 5),
                round(float(row["mean"]), 5),
            ]

    return {
        "status": "ok",
        "threshold_used": threshold,
        "group_count": group_count,
        "participants": participants,
        "consensus": consensus,
        "repness": repness,
        "statement_priorities": statement_priorities,
        "projection": {
            "n_statements": len(result.statements_df),
            "statements": projection_statements,
        },
    }
