// クエリ層の入口(バレル)。実体は queries/ 配下に関心ごとに分けてある。
// 既存の import { ... } from "@/lib/queries" をそのまま使えるよう再輸出する
export * from "./queries/themes-list"; // テーマ一覧(タブ・検索・タグ絞り込み)
export * from "./queries/theme"; // 単一テーマ(本体・意見・投票・計算結果・タグ)
export * from "./queries/report"; // 結果レポートの集計
