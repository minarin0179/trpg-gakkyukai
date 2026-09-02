"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { PARTICIPANT_COOKIE_MAX_AGE_SEC } from "@/lib/config";

type PersonalizationState = {
  votes: Record<number, number>; // 意見ID→自分の投票値(1/0/-1)
  myIndex: number | null; // 意見マップ上の自分の点のindex(未参加/未算出はnull)
  loaded: boolean; // 個人化データの取得が完了したか
  setVote: (statementId: number, value: number) => void; // 投票の楽観的反映
  refresh: () => void; // サーバーから取り直す
};

const Ctx = createContext<PersonalizationState | null>(null);

export function usePersonalization(): PersonalizationState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePersonalization must be used within <ThemePersonalization>");
  return ctx;
}

// Provider の外(結果ページの客観表示など)でも使える版。無ければ null を返す
export function usePersonalizationOptional(): PersonalizationState | null {
  return useContext(Ctx);
}

// テーマページ本体をエッジキャッシュ可能にするため、cookie 依存の個人化だけを
// ここでクライアントから取得して配る。/api/t/[id]/me は pidMap を返さず index だけ返す。
export function ThemePersonalization({
  themeId,
  children,
}: {
  themeId: string;
  children: ReactNode;
}) {
  const [votes, setVotes] = useState<Record<number, number>>({});
  const [myIndex, setMyIndex] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      // 訪問者の大半は一度も参加していない「読むだけの人」で、その場合の
      // /me は常に空応答になる。目印cookie(gk_p、参加時にサーバーが立てる)が
      // 無く、過去に「未参加」を確認済みなら、APIを呼ばずに済ませる。
      // 判定に失敗した場合は安全側(従来通り呼ぶ)に倒す。
      let skip = false;
      let hasMarker = false;
      try {
        hasMarker = document.cookie.split("; ").some((c) => c.startsWith("gk_p="));
        skip = !hasMarker && localStorage.getItem("gk_np") === "1";
      } catch {
        // storageにアクセスできない環境では毎回取得する
      }
      if (skip) return;

      const res = await fetch(`/api/t/${themeId}/me`, { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as {
          votes?: Record<number, number>;
          myIndex?: number | null;
        };
        setVotes(data.votes ?? {});
        setMyIndex(typeof data.myIndex === "number" ? data.myIndex : null);

        // 自己修復: 目印導入前からの参加者は目印を持っていないため、
        // 参加実績が確認できたらクライアント側で目印を立てる。
        // 未参加が確認できたら記録し、次回以降の呼び出しを省略する。
        const participated =
          Object.keys(data.votes ?? {}).length > 0 || typeof data.myIndex === "number";
        try {
          if (participated) {
            document.cookie = `gk_p=1; max-age=${PARTICIPANT_COOKIE_MAX_AGE_SEC}; path=/; samesite=lax`;
            localStorage.removeItem("gk_np");
          } else if (!hasMarker) {
            localStorage.setItem("gk_np", "1");
          }
        } catch {
          // 記録できなくても動作には影響しない
        }
      }
    } catch {
      // 取得に失敗しても本体は表示済み。個人化なしで続行する。
    } finally {
      setLoaded(true);
    }
  }, [themeId]);

  // 初回マウント時の取得。外部(API)からの取り込みなのでeffectが正当な置き場で、
  // setStateも取得完了後にしか呼ばない。唯一の同期パスは「未参加が既知でAPIを省略」
  // したときのloaded確定だけなので、ルールの指摘はここでは受け入れない。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const setVote = useCallback((statementId: number, value: number) => {
    setVotes((v) => ({ ...v, [statementId]: value }));
  }, []);

  // value を毎描画で作り直すと、中身が同じでも全consumerが再描画される。
  // votes/myIndex/loaded が実際に変わったときだけ配り直す。
  // 文脈を votes と identity に分ける案は取らない: 3つのconsumer
  // (VoteDeck・StatementList・OpinionMap)がいずれも votes を読むため、
  // 分けても再描画は減らない
  const value = useMemo(
    () => ({ votes, myIndex, loaded, setVote, refresh }),
    [votes, myIndex, loaded, setVote, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
