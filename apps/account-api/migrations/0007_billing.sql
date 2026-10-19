CREATE TABLE "billing_actions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "billing_actions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"source" text NOT NULL,
	"subscription_id" text NOT NULL,
	"action" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_failure" text,
	"claimed_until" timestamp with time zone,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_customers" (
	"user_id" text PRIMARY KEY NOT NULL,
	"app_account_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"stripe_customer_id" text,
	"checkout_session_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_customers_app_account_token_unique" UNIQUE("app_account_token"),
	CONSTRAINT "billing_customers_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
CREATE TABLE "billing_events" (
	"source" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"outcome" text DEFAULT 'received' NOT NULL,
	"user_id" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_events_source_event_id_pk" PRIMARY KEY("source","event_id")
);
--> statement-breakpoint
CREATE TABLE "billing_ledger" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "billing_ledger_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"source" text NOT NULL,
	"kind" text NOT NULL,
	"outcome" text NOT NULL,
	"reference" text NOT NULL,
	"user_id" text,
	"subscription_id" text,
	"payment_reference" text,
	"amount_minor" bigint,
	"currency" text,
	"environment" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"outcome_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deleted_accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"source" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text,
	"product_id" text NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone,
	"will_renew" boolean,
	"environment" text NOT NULL,
	"period_started_at" timestamp with time zone NOT NULL,
	"state_at" timestamp with time zone NOT NULL,
	"origin" text NOT NULL,
	"retry_started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_source_provider_id_pk" PRIMARY KEY("source","provider_id")
);
--> statement-breakpoint
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_ledger" ADD CONSTRAINT "billing_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_actions_once" ON "billing_actions" USING btree ("source","subscription_id","action");--> statement-breakpoint
CREATE INDEX "billing_actions_owed" ON "billing_actions" USING btree ("done_at");--> statement-breakpoint
CREATE INDEX "billing_events_user_id" ON "billing_events" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_ledger_reference" ON "billing_ledger" USING btree ("source","kind","reference");--> statement-breakpoint
CREATE INDEX "billing_ledger_user_id" ON "billing_ledger" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_user_id" ON "subscriptions" USING btree ("user_id");