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
ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "version" bigint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_changes" ADD CONSTRAINT "sync_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_mutations" ADD CONSTRAINT "sync_mutations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sync_changes_user_sequence" ON "sync_changes" USING btree ("user_id","sequence");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");