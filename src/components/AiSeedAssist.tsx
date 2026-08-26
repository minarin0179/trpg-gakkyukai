"use client";

// Chrome内蔵AI(Prompt API / Gemini Nano)によるシード意見の下書き支援。
// 完全オンデバイス実行のためサーバーコストゼロ・投稿内容の外部送信なし。
// 対応環境(Chrome 138+、デスクトップ、十分なスペック)でのみボタンが現れる
// プログレッシブ・エンハンスメント。非対応環境では何も描画しない。
// ※実験段階: ローカル検証中。品質を確認してから本番投入を判断する。

import { useEffect, useState } from "react";

type LanguageModelSession = {
  prompt: (input: string, opts?: { responseConstraint?: object }) => Promise<string>;
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
与えられたテーマ(問い)に対して、議論の種になる「意見」を8個、日本語で生成してください。

ルール:
- すべての意見は、与えられたテーマの問いにそのまま答える内容にする。
  テーマに出てこない別の話題・行為・職業に置き換えない
- 賛成・反対・条件付き・少数派になりそうな視点まで、立場が偏らないよう幅広く散らすこと
- 各意見は一文だけ・60字以内を目安に、簡潔に書く
- 1つの意見に主張は1つだけ。理由や補足を続けて書かない
- 一人称の主張として断定形で書く(「〜だ」「〜すべきだ」など)
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

      // 小型モデルは「改行区切りで8個」の指示を守れないことがある
      // (全部を1行に繋げる等)ため、JSONスキーマで出力形式を強制する。
      // 非対応・失敗時は素のプロンプト+行分割にフォールバック
      let lines: string[] = [];
      try {
        const raw = await session.prompt(input, {
          responseConstraint: {
            type: "object",
            properties: {
              opinions: {
                type: "array",
                items: { type: "string", maxLength: 140 },
                minItems: 6,
                maxItems: 8,
              },
            },
            required: ["opinions"],
          },
        });
        const parsed = JSON.parse(raw) as { opinions?: unknown };
        if (Array.isArray(parsed.opinions)) {
          lines = parsed.opinions.filter(
            (o): o is string => typeof o === "string" && o.trim().length >= 5,
          );
        }
      } catch {
        // フォールバック: 自由出力を行で分割し、行にならなければ文で分割
        const raw = await session.prompt(input);
        lines = raw
          .split("\n")
          .map((l) => l.replace(/^[\s\d\.\-・*●○]+/, "").trim())
          .filter((l) => l.length >= 5 && l.length <= 140);
        if (lines.length <= 2) {
          lines = raw
            .split(/(?<=。)/)
            .map((l) => l.replace(/^[\s\d\.\-・*●○]+/, "").trim())
            .filter((l) => l.length >= 5 && l.length <= 140);
        }
      }
      lines = lines.map((l) => l.trim()).slice(0, 8);
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
        className="rounded-md bg-stone-900 px-5 py-2 text-xs font-medium text-white hover:bg-stone-700 disabled:opacity-50"
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
