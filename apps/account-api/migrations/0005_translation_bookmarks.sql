CREATE TABLE "translation_bookmarks" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"text" text,
	"translation" text,
	"language" text,
	"bookmarked_at" timestamp with time zone,
	"present" boolean NOT NULL,
	"version" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "translation_bookmarks_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
ALTER TABLE "translation_bookmarks" ADD CONSTRAINT "translation_bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;