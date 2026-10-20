# Account backups

How the account service's databases are backed up, restored, and fenced after a restore. The
service itself is in [`account-api.md`](account-api.md), and setting the backups up on the server
is its Set up the server, step 6.

`apps/account-api/deploy/backups.sh` backs up each environment's database every night: the one
its environment file's `DATABASE_URL` names, so after a restore it backs up the database the
environment runs on. It's `pg_dump` in Postgres's custom format, uploaded to the private R2 bucket
`zenbujapanese-account-backups` as `<environment>/<time>.dump`. The bucket's lifecycle rule deletes a backup after 30 days. The
script runs as root, takes no input but its arguments, and reads its bucket and key from a
root-only file, like the deployer. It logs to `journalctl -t zenbujapanese-account-backups`, and
never a backup's contents.

**Restore** a backup into a new database beside the others:

```sh
sudo zenbujapanese-account-backups restore staging/2026-10-06T031700Z.dump account_restore_check
```

It downloads the backup, creates the database owned by the backup's environment's role
(`account_staging` for a staging backup), restores into it as that role, and logs how many tables
and migrations it holds. It never writes to a database that exists, so it can't overwrite one an
environment uses. Drop the database when you're done looking
(`docker exec zenbujapanese-account-db dropdb --username postgres account_restore_check`).

To run an environment on a restored database, point its `DATABASE_URL` at it
([`account-api.md`](account-api.md), Set up the server, step 2). The deployer sees the
environment's file change and deploys it again within 5 minutes, as it would a new image, with no
request dropped ([`api-servers.md`](api-servers.md), The deployer).
The restored database belongs to the environment's role, so the service migrates it as it would
its own.

**The service fences a restored database itself**, the first time it starts on it. It keeps the
OID of the database it serves in `sync_origin`. A restore is always a new database, with a new
OID, so when the two differ after migrating, under the migration lock, it jumps every profile's
version to the time in milliseconds and the journal's sequence to the time in microseconds (or
leaves each where it is, if that's higher), journals each profile at its new version, and logs
`a restored database`. The jump is to the clock, not by a fixed amount, so every restore lands
past every earlier one, even a second restore of the same backup:

- a change an app made after the backup, and lost with it, can't come back under a version the
  server reuses: it conflicts, and the app takes the profile as it is;
- every app hears of each profile on its next sync, whatever cursor it holds.

**Subscriptions after a restore.** A subscription bought after the backup names an account the
restored database doesn't have and never deleted. The service charges nothing itself, but
Stripe or Apple keeps billing it, so each of its events logs `billing: a running subscription
names an account this service never deleted, as after a restore`. After a restore, watch the
service's log for that line (`docker logs`, [`api-servers.md`](api-servers.md)) for as long as
the stores retry: for each, in Stripe's dashboard, either cancel the subscription and refund it,
or, once the learner signs up again, set its `zenbu_account` metadata to the new account's ID and
resend the event. An App Store one is claimed again by the learner's app when they sign in.

What changed after the backup is lost, as for any restore. Photo files aren't in the backups: they
stay in R2 ([`account-photos.md`](account-photos.md), A restore). The first time the service starts on
any database, it fences it too, and logs `first start on this database`: a new one's journal starts
at the time, and the accounts one already holds (on the first deploy of `sync_origin`, or from a
backup made before it) jump as a restored copy's do. A database restored only to look at is never served, so it stays as the backup
was. Moving the database by dump and reload, to a new server or across a major version without
`pg_upgrade`, looks like a restore and is fenced the same way: every version jumps once, and an
app's change made offline before the move conflicts. `pg_upgrade`, a container restart, and
renaming a database keep its OID.

A night's backup fails, and cron's run exits with an error the journal shows, when Postgres
doesn't answer, or when an environment is set up (its file exists) but its database is missing.
An environment that isn't set up is skipped.
