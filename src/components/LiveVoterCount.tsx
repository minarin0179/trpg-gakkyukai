"use client";

import { useEffect, useState } from "react";

// 参加人数のライブ表示。ページ本体はISR(30分)のため、サーバーレンダリング時の
// 値を初期値に、マウント後に /api/t/[id]/stats(CDN 60秒キャッシュ)で上書きする。
// 取得に失敗しても初期値のまま表示を続ける。
export function LiveVoterCount({ themeId, initial }: { themeId: string; initial: number }) {
  const [count, setCount] = useState(initial);

  useEffect(() => {
    let aborted = false;
    fetch(`/api/t/${themeId}/stats`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { voterCount?: number } | null) => {
        if (!aborted && typeof data?.voterCount === "number") setCount(data.voterCount);
      })
      .catch(() => {});
    return () => {
      aborted = true;
    };
  }, [themeId]);

  return <>{count}</>;
}
