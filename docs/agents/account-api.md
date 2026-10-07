# Account service

`apps/account-api` is where Zenbu accounts, sign-in, and sync will run: a Node service with its own
Postgres database, beside the dictionary service on the API servers
([ADR 0012](../adr/0012-run-accounts-and-sync-in-their-own-service-on-the-api-servers.md)). So far
it's the skeleton: it migrates its database, answers its health checks, and ships the way the
dictionary service does. Sign-in comes in
[#566](https://github.com/serpcompany/zenbujapanese-monorepo/issues/566), and `/v1/me` and
`/v1/sync` in [#567](https://github.com/serpcompany/zenbujapanese-monorepo/issues/567). Every Zenbu
app stays local-first, so nothing in an app waits on this service.

Run every command below from `apps/account-api`, after `pnpm install` at the repository root.

## Run it

The service needs a Postgres database of its own. Any Postgres 18 works; with Docker:

```sh
docker run -d --name zenbu-account-db -e POSTGRES_USER=account -e POSTGRES_DB=account \
  -e POSTGRES_HOST_AUTH_METHOD=trust -p 5432:5432 postgres:18
echo 'DATABASE_URL=postgres://account@localhost:5432/account' > .env
pnpm dev
```

`trust` lets anyone on the machine in without a password, so keep it to a local database.
`pnpm dev` reads `.env` (gitignored), applies the migrations, and serves on port 8789, restarting
on every change.

| Variable | Default | What it does |
| --- | --- | --- |
| `DATABASE_URL` | required | The Postgres database the service owns: `postgres://user:password@host:port/database`. It's never logged or repeated in an error. |
| `PORT` | `8789` | The port it listens on. |
| `ACCOUNT_API_RELEASE` | `local` | The release `/healthz` names. The image sets it to its commit. |

## Routes

Every answer is JSON. An error is `{ "error": { "code": "...", "message": "..." } }`; a `500`
never says what went wrong inside, which only the log records.

| Route | What it answers |
| --- | --- |
| `GET /v1/health` | `{ "status": "ok" }`, or `503` with `{ "status": "unavailable" }` while the database doesn't answer. It names nothing else (#374). |
| `GET /healthz` | The same, with the release, for the deployer and the image's health check. |

## Code layout

`apps/account-api/src` has three layers. Biome's `noRestrictedImports` enforces each rule
(`apps/account-api/biome.json`), with a message that says where the code belongs; tests may import
anything.

- **`src/http`** is the HTTP layer, in Hono. It answers from what `src/server.ts` hands it, and
  never touches the database itself.
- **`src/domain`** will hold the account and sync rules (#567), which both other layers build on,
  so it imports neither, nor Hono, nor a database driver.
- **`src/db`** is the database layer: Drizzle ORM over `pg`, and the migrations. It knows nothing
  of HTTP.

`src/config.ts` reads the environment, and `src/server.ts` wires the layers together and is
imported by nothing. Logging, the request log, and stopping cleanly on SIGTERM come from
`packages/node-service`, as in the dictionary service ([`dictionary-api.md`](dictionary-api.md),
Code layout). Nothing calls `console`, and nothing logs a learner's email, a code, a token, or a
link: only what happened, as SERP's
[transactional email standard](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/transactional-email.md)
says for email.

## The database

The service owns one Postgres 18 database per environment, and only it connects to it. The schema
is in versioned migrations in `apps/account-api/migrations/`, in Drizzle's format (one SQL file per
migration, and `meta/_journal.json`). There are none yet: the first tables come with sign-in
(#566).

The service applies the migrations when it starts, before it listens, holding a Postgres advisory
lock so two starts take them one after the other. A deploy starts the new image while the old one
still serves, so **every migration keeps the running code working**: add a column or table first,
and remove the old one only in a later release (#374's planning notes of 2026-09-28).

## Check it

```sh
pnpm check
```

It runs Biome, the typecheck, the tests, and the bundle. The tests need no database server: they
run Postgres in the test process with PGlite, both directly and through its socket server, which
the service's own `pg` driver connects to. Set `ACCOUNT_API_TEST_DATABASE_URL` to an empty
Postgres database to run the driver tests against it instead, including two migrations started at
once, which PGlite's single session can't show. The `Account API` workflow does that against
Postgres 18 ([`ci.md`](ci.md), Account API).

## Ship it

The service ships as one Docker image: the bundled code and the migrations. The
`Account API deploy` workflow builds it, pushes it to the GitHub Container Registry, and points each
environment's tag at it; the deployer on the server deploys what the tags name
([`api-servers.md`](api-servers.md), The deployer).

### The image

Build and run it by hand from the repository root, beside a Postgres it can reach:

```sh
docker build -f apps/account-api/Dockerfile --build-arg RELEASE=$(git rev-parse --short HEAD) \
  -t zenbujapanese-account-api .
docker run --network host -e DATABASE_URL=postgres://account@localhost:5432/account \
  zenbujapanese-account-api
```

It has a health check on `/healthz`, runs on a read-only file system, and stops cleanly on SIGTERM.
`scripts/build.mjs` bundles `src/server.ts` and everything it imports into `dist/server.mjs`, so the
image holds no `node_modules`. The build context is the repository root, and
`Dockerfile.dockerignore` lets in only what the `Dockerfile` copies, so a file the image needs goes
in both.

### How a deploy works

`.github/workflows/account-api-deploy.yml` runs on a push to `main` that changes what the image
holds (the service, what the services share, or the lockfile), and by hand:

1. **`image`** builds the image and starts it against an empty Postgres 18. It checks that the
   image migrates it, that `/healthz` names this commit's release, and that `/v1/health` answers
   `{"status":"ok"}`. It then pushes it as `ghcr.io/serpcompany/zenbujapanese-account-api:sha-<commit>`
   and `:main`. A pull request that changes the image runs only this build and check.
2. **`staging`** signs the image's digest with cosign, then moves the `:staging` tag to it.
3. **`production`** moves the `:production` tag to it, once `staging` has. `DEPLOY_PRODUCTION` set
   to `false` stops at staging; a run by hand still deploys production.

The `staging` environment only accepts `main`, and the deployer runs an image only when `main`'s
workflow signed it. Nothing in CI can see what the server runs, since Bot Fight Mode challenges CI
runners: check `https://account-api-staging.zenbujapanese.com/v1/health` in a browser.

- **Roll back** by running the workflow by hand with `tag` set to the version to go back to, such
  as `sha-0123456789ab`. A migration doesn't roll back: an older image runs against the newer
  schema, which add-first migrations keep working.
- **See what runs and retry a failed image** as [`api-servers.md`](api-servers.md) says, with
  `zenbujapanese.account-api.slot`, `journalctl -t zenbujapanese-account-api`, and
  `/var/lib/zenbujapanese-account-api/`.

## Back up and restore

`apps/account-api/deploy/backups.sh` backs up each environment's database every night: `pg_dump` in Postgres's
custom format, uploaded to the private R2 bucket `zenbujapanese-account-backups` as
`<environment>/<time>.dump`. The bucket's lifecycle rule deletes a backup after 30 days. The
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

To run an environment on a restored database, point its `DATABASE_URL` at it (Set up the server,
step 2). The deployer sees the environment's file change and deploys it again within 5 minutes, as
it would a new image, with no request dropped ([`api-servers.md`](api-servers.md), The deployer).
The restored database belongs to the environment's role, so the service migrates it as it would
its own.

A night's backup fails, and cron's run exits with an error the journal shows, when Postgres
doesn't answer, or when an environment is set up (its file exists) but its database is missing.
An environment that isn't set up is skipped.

## Set up the server

First set up what the services share: cosign, the deployer, and registry access
([`api-servers.md`](api-servers.md), Set up the server). Then, as root:

1. **Postgres 18**, alone on an internal network, so only the service's slots reach it:
   ```sh
   sudo install -d -m 700 /etc/zenbujapanese-account-db
   printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 24)" |
     sudo tee /etc/zenbujapanese-account-db/postgres.env >/dev/null
   sudo chmod 600 /etc/zenbujapanese-account-db/postgres.env
   docker network create --internal zenbujapanese-account-db
   docker run -d --name zenbujapanese-account-db --restart unless-stopped \
     --network zenbujapanese-account-db --volume zenbujapanese-account-db:/var/lib/postgresql \
     --env-file /etc/zenbujapanese-account-db/postgres.env --memory 1g --shm-size 256m postgres:18
   ```
2. **A role and a database for each environment**, each owning only its own, and each
   environment's file, `/etc/zenbujapanese-account-api/<environment>.env`, which names them. The
   SQL goes in on stdin, so the password never shows in a process listing, and nothing is created
   twice, so a rerun only sets a new password and rewrites the file:
   ```sh
   sudo install -d -m 700 /etc/zenbujapanese-account-api
   for environment in staging production; do
     password="$(openssl rand -hex 24)"
     docker exec --interactive zenbujapanese-account-db psql --username postgres --quiet \
       --set ON_ERROR_STOP=1 <<SQL
   select 'create role account_$environment login'
     where not exists (select from pg_roles where rolname = 'account_$environment') \gexec
   select 'create database account_$environment owner account_$environment'
     where not exists (select from pg_database where datname = 'account_$environment') \gexec
   alter role account_$environment password '$password';
   SQL
     printf 'DATABASE_URL=postgres://account_%s:%s@zenbujapanese-account-db:5432/account_%s\n' \
       "$environment" "$password" "$environment" |
       sudo tee /etc/zenbujapanese-account-api/$environment.env >/dev/null
     sudo chmod 600 /etc/zenbujapanese-account-api/$environment.env
   done
   unset password
   ```
3. **More settings**, such as sign-in's keys (#566), go in the environment's file too. An
   environment without its file isn't deployed, and the deployer deploys an environment again when
   its file changes.
4. **nginx.** The nginx repository holds `nginx/account-api-staging.zenbujapanese.com.conf` and
   `nginx/account-api.zenbujapanese.com.conf`, which proxy to the environment's alias on port 8789
   ([`api-servers.md`](api-servers.md), Set up the server, step 4).

   **The slots' network.** Create it, not internal, since the service calls Apple, Google, and
   Email Service, and connect the running nginx to it:
   ```sh
   docker network create zenbujapanese-account-api
   docker network connect zenbujapanese-account-api nginx
   ```
5. **Cloudflare**: proxied DNS records for `account-api.zenbujapanese.com` and
   `account-api-staging.zenbujapanese.com` ([`api-servers.md`](api-servers.md), Set up the server,
   step 5).
6. **Backups.**
   - The AWS CLI v2, from AWS's installer.
   - An R2 bucket, `zenbujapanese-account-backups`, private, with a lifecycle rule that deletes
     objects after 30 days, and an R2 API token with Object Read & Write on that bucket alone.
   - The script and its settings:
   ```sh
   sudo install -m 755 apps/account-api/deploy/backups.sh /usr/local/bin/zenbujapanese-account-backups
   read -rsp 'Secret access key: ' secret && echo
   printf 'R2_BUCKET=zenbujapanese-account-backups\nR2_ENDPOINT=https://%s.r2.cloudflarestorage.com\nR2_ACCESS_KEY_ID=%s\nR2_SECRET_ACCESS_KEY=%s\n' \
     <cloudflare account id> <access key id> "$secret" |
     sudo tee /etc/zenbujapanese-account-api/backup.env >/dev/null
   sudo chmod 600 /etc/zenbujapanese-account-api/backup.env
   unset secret
   echo '17 3 * * * root timeout 2h /usr/local/bin/zenbujapanese-account-backups >/dev/null 2>&1' |
     sudo tee /etc/cron.d/zenbujapanese-account-backups >/dev/null
   sudo chmod 644 /etc/cron.d/zenbujapanese-account-backups
   ```
7. **The first deploy.** Run the workflow by hand (Actions → Account API deploy → Run workflow); the
   deployer starts each image within 5 minutes of its tag moving. Then, before anything relies on
   it:
   - `GET /v1/health` answers on `https://account-api-staging.zenbujapanese.com` and
     `https://account-api.zenbujapanese.com`, in a browser.
   - A request from the iOS app, on the Simulator and on a device, reaches staging. If Bot Fight
     Mode challenges it, the owners turn Bot Fight Mode off (ADR 0012), and this doc says so.
   - Run the backup by hand (`sudo zenbujapanese-account-backups`), then restore it into a new
     database (Back up and restore, above).
