CREATE TABLE "watched_videos" (
	"user_id" text NOT NULL,
	"video_id" text NOT NULL,
	"title" text,
	"author" text,
	"duration" double precision,
	"position" double precision,
	"comprehension" double precision,
	"watched_at" timestamp with time zone,
	"status" text NOT NULL,
	"version" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watched_videos_user_id_video_id_pk" PRIMARY KEY("user_id","video_id")
);
--> statement-breakpoint
ALTER TABLE "watched_videos" ADD CONSTRAINT "watched_videos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;