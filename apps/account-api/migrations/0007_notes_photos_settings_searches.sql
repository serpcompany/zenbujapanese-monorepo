CREATE TABLE "forgotten_versions" (
	"user_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"version" bigint NOT NULL,
	CONSTRAINT "forgotten_versions_user_id_entity_type_pk" PRIMARY KEY("user_id","entity_type")
);
--> statement-breakpoint
CREATE TABLE "learner_settings" (
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"value" jsonb NOT NULL,
	"version" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learner_settings_user_id_name_pk" PRIMARY KEY("user_id","name")
);
--> statement-breakpoint
CREATE TABLE "photo_file_deletions" (
	"storage_key" text PRIMARY KEY NOT NULL,
	"due_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photo_files" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"profile_upload_at" timestamp with time zone,
	CONSTRAINT "photo_files_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "photo_files_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "photo_words" (
	"user_id" text NOT NULL,
	"photo_id" text NOT NULL,
	"item_id" text NOT NULL,
	"headword" text NOT NULL,
	"reading" text NOT NULL,
	"saved_at" timestamp with time zone NOT NULL,
	"present" boolean NOT NULL,
	"version" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photo_words_user_id_photo_id_item_id_pk" PRIMARY KEY("user_id","photo_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text,
	"saved_at" timestamp with time zone,
	"status" text NOT NULL,
	"version" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photos_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "profile_photos" (
	"user_id" text PRIMARY KEY NOT NULL,
	"photo_id" text,
	"version" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recent_searches" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"query" text,
	"searched_at" timestamp with time zone,
	"status" text NOT NULL,
	"version" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recent_searches_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "word_notes" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"item_id" text,
	"text" text,
	"headword" text,
	"reading" text,
	"present" boolean NOT NULL,
	"version" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "word_notes_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
ALTER TABLE "forgotten_versions" ADD CONSTRAINT "forgotten_versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_settings" ADD CONSTRAINT "learner_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_files" ADD CONSTRAINT "photo_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_words" ADD CONSTRAINT "photo_words_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_photos" ADD CONSTRAINT "profile_photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recent_searches" ADD CONSTRAINT "recent_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_notes" ADD CONSTRAINT "word_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "photo_file_deletions_due" ON "photo_file_deletions" USING btree ("due_at");