# Account service migrations

How the account service's database changes: the migrations, the rule that keeps the running code
working through a deploy, and the check that holds every pull request to it. The tables are in
[`account-api.md`](account-api.md), The database.

## Writing one

The migrations are in `apps/account-api/migrations/`, in Drizzle's format. To change the schema,
change `src/db/schema.ts` or billing's `src/db/billing-schema.ts`, then run
`pnpm db:generate --name <what it does>` and commit the SQL and `meta/` files it writes. Never
edit or regenerate a migration once it has run anywhere: Drizzle runs only those dated after the
last one a database ran, so an edited one never runs where the old one did, and a regenerated one,
with a new date, runs again over the tables it made: add a new one. For SQL drizzle-kit doesn't
write, such as the journal's trigger, run `pnpm db:generate --custom --name <what it does>` and
fill in the empty file. They're drizzle-kit's, comments and formatting included, so Biome and the
comments check leave the folder alone.

## Add first, remove later

The service applies the migrations when it starts, before it listens, holding a Postgres advisory
lock so two starts take them one after the other. A deploy starts the new image while the old one
still serves, so **every migration keeps the running code working**: add a column or table first,
and remove the old one only in a later release (#374's planning notes of 2026-09-28).

The old image reads every column its schema declares: Drizzle names each one in what it selects
and returns, and Better Auth's queries go through it. So a removal takes two releases:

1. Take the column or table out of the schema and the code, run `pnpm db:generate`, and delete
   the drop from the SQL it writes, leaving `ALTER COLUMN … DROP NOT NULL` for a `NOT NULL`
   column with no default. The snapshot then leaves it out while the database keeps it.
2. Once that is on `main`, drop it in a migration of its own:
   `pnpm db:generate --custom --name <what it drops>`, filled in with the drop.

A rename is an add and then a removal, so it takes three releases: add the new column and fill it,
move the code to it and take the old one out of the schema (step 1), then drop the old one (step
2).

## The check

`tools/checks/migrations.mjs` runs in the `Repository` workflow on every pull request and in the
merge queue, against the commit the change merges into (`HEAD^1`; [`ci.md`](ci.md),
Repository). It reads the SQL of each migration the change adds to the journal, and refuses one
that drops, renames, or moves a table, or drops or renames a column, that the base's last snapshot
(`meta/<number>_snapshot.json`) still has. Locally, `node tools/checks/migrations.mjs origin/main`
runs it against `main`.

It reads the base's snapshot rather than its schema. The snapshot is the JSON drizzle-kit writes
from the schema with each migration, so `git show` reads it whole and nothing of the service runs;
the schema is TypeScript, built through helpers such as `owner()` and `...revision()`, which only
running it with the base's code and Drizzle would read. Under the steps above the two agree, and
where a schema changed without a migration the snapshot still has the column, so the check refuses
rather than lets a drop through. Nothing in the service reads a table outside the schema: its raw
SQL names only the schema's tables (`src/db/restores.ts`, `src/db/billing.ts`).

It also reads statements in a block that runs at once (`DO $$ … $$`) and in a function's body, and
ignores comments, constraints, indexes, and a column's `DROP NOT NULL` or `DROP DEFAULT`. A base it
can't read, a base whose journal names a snapshot it lacks, and a migration the journal names
without its SQL file each fail the check rather than pass it. Quoted text, such as a default of
`')'` or `','`, never splits an `ALTER TABLE`'s actions.

Its tests (`tools/checks/src/migrations.test.ts`) run it on what drizzle-kit 0.31 writes when
`users.language` leaves the schema or becomes `locale`, and when `sync_origin` leaves it or becomes
`database_origin`, each refused; on every migration on `main` as it was added, each passed; and on
step 2 above, passed once `main`'s snapshot has left the column out. Those refusals start from the
nine migrations `main` had when the check arrived (`0000` to `0008`), which never change once run,
so a later drop on `main`, made as above, leaves the tests as they are.
