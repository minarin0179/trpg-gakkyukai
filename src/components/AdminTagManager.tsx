"use client";

import { useMemo, useState } from "react";
import { adminSetTagAction } from "@/app/admin/actions";

type Item = { id: string; title: string; tags: string[] };

// タグの一括整理UI(運営用)。行ごとに: チップの×で外す /
// パレット(語彙)のクリックか自由入力で付ける。操作は即DB反映し、
// 画面はローカル状態を更新する(全体リロードなしでテンポよく回せる)
export function AdminTagManager({
  initialItems,
  vocabulary,
}: {
  initialItems: Item[];
  vocabulary: string[];
}) {
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null); // パレットを開いている行
  const [freeInput, setFreeInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = filter.trim().toLowerCase();
  const visible = useMemo(
    () =>
      q
        ? items.filter(
            (t) =>
              t.title.toLowerCase().includes(q) ||
              t.tags.some((tag) => tag.toLowerCase().includes(q)) ||
              (q === "なし" && t.tags.length === 0),
          )
        : items,
    [items, q],
  );

  async function mutate(themeId: string, tag: string, op: "add" | "remove") {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await adminSetTagAction(themeId, tag, op);
    if (res.ok) {
      setItems((prev) =>
        prev.map((t) =>
          t.id !== themeId
            ? t
            : {
                ...t,
                tags:
                  op === "add"
                    ? t.tags.some((x) => x.toLowerCase() === tag.toLowerCase())
                      ? t.tags
                      : [...t.tags, tag]
                    : t.tags.filter((x) => x !== tag),
              },
        ),
      );
    } else {
      setError(res.error);
    }
    setBusy(false);
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="タイトル・タグで絞り込み(「なし」でタグ未設定のみ)"
          className="w-80 rounded-md border border-stone-400 bg-white px-3 py-1.5 text-sm"
        />
        <span className="text-xs text-stone-500">
          {visible.length}/{items.length}件
        </span>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>

      <ul className="flex flex-col gap-1.5">
        {visible.map((t) => (
          <li
            key={t.id}
            className="rounded-md border border-stone-300 bg-white px-3 py-2"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <a
                href={`/t/${t.id}`}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-sm hover:underline"
                title={t.title}
              >
                {t.title}
              </a>
              <span className="flex flex-wrap items-center gap-1">
                {t.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-0.5 rounded-full border border-stone-300 bg-stone-50 px-2 py-0.5 text-xs text-stone-700"
                  >
                    {tag}
                    <button
                      onClick={() => mutate(t.id, tag, "remove")}
                      disabled={busy}
                      aria-label={`${tag}を外す`}
                      className="ml-0.5 font-bold text-stone-400 hover:text-rose-600 disabled:opacity-50"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <button
                  onClick={() => {
                    setActiveId(activeId === t.id ? null : t.id);
                    setFreeInput("");
                  }}
                  className="rounded-full border border-dashed border-stone-400 px-1.5 py-0.5 text-xs text-stone-500 hover:border-stone-600"
                >
                  {activeId === t.id ? "閉じる" : "+"}
                </button>
              </span>
            </div>
            {activeId === t.id && (
              <div className="mt-2 border-t border-stone-200 pt-2">
                <div className="flex flex-wrap gap-1">
                  {vocabulary
                    .filter((v) => !t.tags.some((x) => x.toLowerCase() === v.toLowerCase()))
                    .map((v) => (
                      <button
                        key={v}
                        onClick={() => mutate(t.id, v, "add")}
                        disabled={busy}
                        className="rounded-full border border-stone-300 bg-white px-2 py-0.5 text-xs text-stone-600 hover:border-stone-500 disabled:opacity-50"
                      >
                        {v}
                      </button>
                    ))}
                  <input
                    value={freeInput}
                    onChange={(e) => setFreeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && freeInput.trim()) {
                        e.preventDefault();
                        mutate(t.id, freeInput.trim(), "add");
                        setFreeInput("");
                      }
                    }}
                    placeholder="新しいタグ(Enterで追加)"
                    className="w-40 rounded-md border border-stone-400 bg-white px-2 py-0.5 text-xs"
                  />
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
