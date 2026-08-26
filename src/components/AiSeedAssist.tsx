"use client";

// Chrome内蔵AI(Prompt API / Gemini Nano)によるシード意見の下書き支援。
// 完全オンデバイス実行のためサーバーコストゼロ・投稿内容の外部送信なし。
// 対応環境(Chrome 138+、デスクトップ、十分なスペック)でのみボタンが現れる
// プログレッシブ・エンハンスメント。非対応環境では何も描画しない。
// ※実験段階: ローカル検証中。品質を確認してから本番投入を判断する。

import { useEffect, useState } from "react";

type LanguageModelSession = {
  prompt: (input: string) => Promise<string>;
  destroy: () => void;
};

declare global {
  // Chrome 138+ のグローバル。他ブラウザには存在しない
  const LanguageModel:
    | {
        availability: (opts?: unknown) => Promise<
          "unavailable" | "downloadable" | "downloading" | "available"
        >;
        create: (opts?: {
          initialPrompts?: { role: string; content: string }[];
          expectedInputs?: { type: string; languages: string[] }[];
          expectedOutputs?: { type: string; languages: string[] }[];
          monitor?: (m: EventTarget) => void;
        }) => Promise<LanguageModelSession>;
      }
    | undefined;
}

const SYSTEM_PROMPT = `あなたはTRPGコミュニティの議論プラットフォームの補助AIです。
与えられたテーマ(問い)に対して、これから議論の種になる「意見」を5個、日本語で生成してください。

ルール:
- 賛成側・反対側・条件付き・別の視点、をバランスよく含めること
- 各意見は140字以内。一人称の主張として断定形で書く(「〜だ」「〜すべきだ」など)
- 1行に1つ。番号・記号・見出しは付けない
- 意見の本文だけを出力する`;

export function AiSeedAssist({
  title,
  description,
  onGenerated,
}: {
  title: string;
  description: string;
  onGenerated: (lines: string[]) => void;
}) {
  const [status, setStatus] = useState<
    "checking" | "hidden" | "ready" | "needs-download" | "downloading" | "generating" | "error"
  >("checking");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        if (typeof LanguageModel === "undefined") {
          setStatus("hidden");
          return;
        }
        const a = await LanguageModel.availability({
          expectedInputs: [{ type: "text", languages: ["ja"] }],
          expectedOutputs: [{ type: "text", languages: ["ja"] }],
        });
        if (a === "available") setStatus("ready");
        else if (a === "downloadable" || a === "downloading") setStatus("needs-download");
        else setStatus("hidden");
      } catch {
        setStatus("hidden");
      }
    })();
  }, []);

  async function generate() {
    if (!title.trim()) {
      setErrorMsg("先にテーマ(問い)を入力してください");
      return;
    }
    setErrorMsg("");
    const wasReady = status === "ready";
    setStatus(wasReady ? "generating" : "downloading");
    let session: LanguageModelSession | null = null;
    try {
      session = await LanguageModel!.create({
        initialPrompts: [{ role: "system", content: SYSTEM_PROMPT }],
        expectedInputs: [{ type: "text", languages: ["ja"] }],
        expectedOutputs: [{ type: "text", languages: ["ja"] }],
        monitor(m) {
          m.addEventListener("downloadprogress", (e) => {
            const ev = e as ProgressEvent;
            setProgress(Math.round((ev.loaded ?? 0) * 100));
          });
        },
      });
      setStatus("generating");
      const input = description.trim()
        ? `テーマ: ${title}\n補足説明: ${description}`
        : `テーマ: ${title}`;
      const raw = await session.prompt(input);
      const lines = raw
        .split("\n")
        .map((l) => l.replace(/^[\s\d\.\-・*●○]+/, "").trim())
        .filter((l) => l.length >= 5 && l.length <= 140)
        .slice(0, 6);
      if (lines.length === 0) {
        setErrorMsg("うまく生成できませんでした。もう一度試すか、手で書いてみてください");
      } else {
        onGenerated(lines);
      }
      setStatus("ready");
    } catch (e) {
      console.error("AiSeedAssist:", e);
      setErrorMsg("生成に失敗しました。時間を置いて試してください");
      setStatus("error");
    } finally {
      session?.destroy();
    }
  }

  if (status === "checking") return null;

  // 非対応環境でも機能の存在は告知する(使えるのは対応スペックのPC版Chromeのみ)
  if (status === "hidden") {
    return (
      <span className="text-xs text-stone-500">
        対応スペックのPC版Chromeでは、AIで最初の意見を生成できます
      </span>
    );
  }

  return (
    <span className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={generate}
        disabled={status === "generating" || status === "downloading"}
        title="お使いのブラウザに内蔵されたAIがその場で動作します。入力内容が外部に送信されることはありません"
        className="rounded-md border border-amber-400 bg-amber-50 px-2.5 py-1 text-xs font-medium text-stone-800 hover:bg-amber-100 disabled:opacity-50"
      >
        {status === "generating"
          ? "生成中..."
          : status === "downloading"
            ? `準備中... ${progress}%`
            : "AIで最初の意見を生成"}
      </button>
      {errorMsg && <span className="text-xs text-red-600">{errorMsg}</span>}
    </span>
  );
}
