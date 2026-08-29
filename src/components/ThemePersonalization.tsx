"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

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
      const res = await fetch(`/api/t/${themeId}/me`, { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as {
          votes?: Record<number, number>;
          myIndex?: number | null;
        };
        setVotes(data.votes ?? {});
        setMyIndex(typeof data.myIndex === "number" ? data.myIndex : null);
      }
    } catch {
      // 取得に失敗しても本体は表示済み。個人化なしで続行する。
    } finally {
      setLoaded(true);
    }
  }, [themeId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setVote = useCallback((statementId: number, value: number) => {
    setVotes((v) => ({ ...v, [statementId]: value }));
  }, []);

  return (
    <Ctx.Provider value={{ votes, myIndex, loaded, setVote, refresh }}>{children}</Ctx.Provider>
  );
}
