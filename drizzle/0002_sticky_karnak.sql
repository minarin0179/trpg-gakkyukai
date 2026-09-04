CREATE TABLE "digests" (
	"week_start" date PRIMARY KEY NOT NULL,
	"body" jsonb NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"posted_at" timestamp with time zone,
	"post_id" text,
	"post_error" text
);
