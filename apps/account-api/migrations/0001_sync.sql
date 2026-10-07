CREATE TABLE "known_words" (
	"user_id" text NOT NULL,
	"item_id" text NOT NULL,
	"headword" text NOT NULL,
	"reading" text NOT NULL,
	"known" boolean NOT NULL,
	"version" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "known_words_user_id_item_id_pk" PRIMARY KEY("user_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "list_words" (
	"user_id" text NOT NULL,
	"list_id" text NOT NULL,
	"item_id" text NOT NULL,
	"headword" text NOT NULL,
	"reading" text NOT NULL,
	"present" boolean NOT NULL,
	"version" bigint NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "list_words_user_id_list_id_item_id_pk" PRIMARY KEY("user_id","list_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "sync_changes" (
	"sequence" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sync_changes_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"entity_version" bigint NOT NULL,
	"operation" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_mutations" (
	"user_id" text NOT NULL,
	"client_mutation_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"operation" text NOT NULL,
	"request_sha256" text NOT NULL,
	"outcome" text NOT NULL,
	"resulting_server_version" bigint,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_mutations_user_id_client_mutation_id_pk" PRIMARY KEY("user_id","client_mutation_id")
);
--> statement-breakpoint
CREATE TABLE "sync_origin" (
	"database_oid" bigint PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "word_lists" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"version" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "word_lists_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "version" bigint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "known_words" ADD CONSTRAINT "known_words_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_words" ADD CONSTRAINT "list_words_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_changes" ADD CONSTRAINT "sync_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_mutations" ADD CONSTRAINT "sync_mutations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_lists" ADD CONSTRAINT "word_lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sync_changes_user_sequence" ON "sync_changes" USING btree ("user_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_changes_entity" ON "sync_changes" USING btree ("user_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "sync_mutations_user_created" ON "sync_mutations" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");