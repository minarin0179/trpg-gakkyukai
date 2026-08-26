import {
  pgTable,
  text,
  timestamp,
  integer,
  smallint,
  jsonb,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

// テーマ(議題)。事前審査なしで即時公開、一定の参加を得ると新着→メイン一覧へ昇格する
export const themes = pgTable("themes", {
  id: text("id").primaryKey(), // nanoid
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status", { enum: ["active", "removed"] })
    .notNull()
    .default("active"),
  removedReason: text("removed_reason"),
  proposerHash: text("proposer_hash").notNull(), // 提案者のcookie IDハッシュ(レート制限用)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 匿名参加者。ブラウザcookieのUUIDと1:1
export const participants = pgTable("participants", {
  id: text("id").primaryKey(), // uuid (cookie値)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 意見(ステートメント)。匿名で投稿でき、投票の対象になる
export const statements = pgTable(
  "statements",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    themeId: text("theme_id")
      .notNull()
      .references(() => themes.id),
    text: text("text").notNull(),
    status: text("status", { enum: ["visible", "removed"] })
      .notNull()
      .default("visible"),
    removedReason: text("removed_reason"),
    participantId: text("participant_id").references(() => participants.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("statements_theme_idx").on(t.themeId)],
);

// 投票。賛成=1 / 反対=-1 / パス=0 (Polis互換の符号)。再投票はupsert
export const votes = pgTable(
  "votes",
  {
    statementId: integer("statement_id")
      .notNull()
      .references(() => statements.id),
    participantId: text("participant_id")
      .notNull()
      .references(() => participants.id),
    themeId: text("theme_id")
      .notNull()
      .references(() => themes.id),
    value: smallint("value").notNull(), // 1 | -1 | 0
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.statementId, t.participantId] }),
    index("votes_theme_idx").on(t.themeId),
  ],
);

// クラスタリング結果(red-dwarfの出力)。テーマごとに最新1件を保持
export const mathResults = pgTable("math_results", {
  themeId: text("theme_id")
    .primaryKey()
    .references(() => themes.id),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  voteCount: integer("vote_count").notNull(), // 計算時点の総投票数(再計算要否の判定に使う)
  result: jsonb("result").notNull(), // { participants: [{id,x,y,cluster}], statements: [{id,stats...}], groupCount }
});

// 通報。事後モデレーション(notice & takedown)の入口
export const reports = pgTable("reports", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  targetType: text("target_type", { enum: ["theme", "statement", "contact"] }).notNull(),
  targetId: text("target_id").notNull(),
  reason: text("reason").notNull(),
  ipHash: text("ip_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// レート制限イベント(テーマ提案・意見投稿の流量制御)
export const rateEvents = pgTable(
  "rate_events",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    kind: text("kind", {
      enum: ["theme_create", "statement_create", "statement_create_ip", "report_create"],
    }).notNull(),
    actorHash: text("actor_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rate_events_actor_idx").on(t.actorHash, t.kind, t.createdAt)],
);
