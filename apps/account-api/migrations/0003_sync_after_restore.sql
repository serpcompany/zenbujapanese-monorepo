CREATE FUNCTION "sync_after_restore"() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
	PERFORM setval(
		pg_get_serial_sequence('"sync_changes"', 'sequence'),
		(SELECT coalesce(max("sequence"), 0) FROM "sync_changes") + 1000000000
	);
	UPDATE "users" SET "version" = "version" + 1000000;
	INSERT INTO "sync_changes" ("user_id", "entity_type", "entity_id", "entity_version", "operation")
	SELECT "id", 'profile', "id", "version", 'update' FROM "users" ORDER BY "created_at", "id";
END
$$;
