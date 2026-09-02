// 計算結果(red-dwarf の出力)のJSONの形と、クライアントへ渡す前の変換を1か所に集める。
// 保存側(recompute)と読み出し側(ページ・集計)で型がずれると、
// pidMap の取り扱いのような安全に関わる箇所を見落とすため

// repness(グループを代表する意見)の1件。
// repful_for は実質 "agree" | "disagree" だが、計算側の出力をそのまま持つ
export type RepnessItem = { statement_id: number; repful_for: string };

// 保存するJSONの形。pidMap(参加者UUID→行列インデックス)はサーバー内部専用で、
// クライアントに渡す前に必ず取り除くこと(UUIDは参加者の身元そのもの)
export type MathResultJson = {
  status: "ok" | "insufficient";
  reason?: string;
  // マップに載るのに必要な最低投票数(意見が少ないテーマではその意見数まで下がる)
  threshold_used?: number;
  group_count?: number;
  participants?: { id: number; x: number; y: number; cluster: number | null }[];
  consensus?: {
    agree: { statement_id: number; agree_ratio: number | null }[];
    disagree: { statement_id: number; agree_ratio: number | null }[];
  };
  repness?: Record<string, RepnessItem[]>;
  // 意見の提示優先度(本家Polisのcomment priority)。投票デッキの重み付き抽選に使う
  statement_priorities?: Record<string, number>;
  // 自分の点のライブ投影用(意見ごとの [pc1, pc2, mean] とマップの全意見数)
  projection?: { n_statements: number; statements: Record<string, [number, number, number]> };
  pidMap?: Record<string, number>;
};

// クライアント(意見マップ)に渡してよい形。pidMap は身元、reason は
// 計算不成立の内部事情で表示に使わないため、どちらも落とす
export type PublicMathResult = Omit<MathResultJson, "pidMap" | "reason">;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// DBのjsonbや計算APIの応答は型注釈では保証されないので、使う前に形を確かめる。
// 深い検証はせず、壊れた値がそのままUIに流れることだけを防ぐ実用重視の判定
export function isMathResultJson(v: unknown): v is MathResultJson {
  if (!isRecord(v)) return false;
  if (v.status !== "ok" && v.status !== "insufficient") return false;
  if (v.reason !== undefined && typeof v.reason !== "string") return false;
  if (v.threshold_used !== undefined && typeof v.threshold_used !== "number") return false;
  if (v.group_count !== undefined && typeof v.group_count !== "number") return false;
  if (v.participants !== undefined) {
    // 座標が数値でないと散布図の描画が壊れるため、ここだけは要素まで見る
    if (!Array.isArray(v.participants)) return false;
    if (
      !v.participants.every(
        (p) => isRecord(p) && typeof p.x === "number" && typeof p.y === "number",
      )
    ) {
      return false;
    }
  }
  if (v.consensus !== undefined) {
    if (!isRecord(v.consensus)) return false;
    if (!Array.isArray(v.consensus.agree) || !Array.isArray(v.consensus.disagree)) return false;
  }
  if (v.repness !== undefined && !isRecord(v.repness)) return false;
  if (v.statement_priorities !== undefined && !isRecord(v.statement_priorities)) return false;
  if (v.projection !== undefined) {
    if (!isRecord(v.projection)) return false;
    if (typeof v.projection.n_statements !== "number") return false;
    if (!isRecord(v.projection.statements)) return false;
  }
  if (v.pidMap !== undefined && !isRecord(v.pidMap)) return false;
  return true;
}

// クライアントへ渡す形に変換する。形が想定外なら null(=マップを出さない)。
// pidMap は参加者UUIDそのものなので、絶対にクライアントへ出さない。
// 自分の点の位置は /api/t/[id]/me がサーバー側で pidMap を引いて解決する
export function toPublicMathResult(raw: unknown): PublicMathResult | null {
  if (!isMathResultJson(raw)) return null;
  const copy: MathResultJson = { ...raw };
  delete copy.pidMap;
  delete copy.reason;
  return copy;
}
