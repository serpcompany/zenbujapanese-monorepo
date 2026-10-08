CREATE FUNCTION "journal_new_account"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO "sync_changes" ("user_id", "entity_type", "entity_id", "entity_version", "operation")
	VALUES (NEW."id", 'profile', NEW."id", NEW."version", 'create');
	RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER "users_journal_new_account" AFTER INSERT ON "users"
FOR EACH ROW EXECUTE FUNCTION "journal_new_account"();
--> statement-breakpoint
INSERT INTO "sync_changes" ("user_id", "entity_type", "entity_id", "entity_version", "operation")
SELECT "id", 'profile', "id", "version", 'create' FROM "users" ORDER BY "created_at", "id";
