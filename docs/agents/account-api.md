# Account service

`apps/account-api` is where Zenbu accounts, sign-in, and sync run: a Node service with its own
Postgres database, beside the dictionary service on the API servers
([ADR 0011](../adr/0011-run-accounts-and-sync-in-their-own-service-on-the-api-servers.md)). It signs
learners in with Apple, Google, or a code sent by email, through Better Auth, and issues the tokens
the apps and other services use. `/v1/me` and `/v1/sync` come in
[#567](https://github.com/serpcompany/zenbujapanese-monorepo/issues/567). Every Zenbu app stays
local-first, so nothing in an app waits on this service.

Run every command below from `apps/account-api`, after `pnpm install` at the repository root.

## Run it

The service needs a Postgres database of its own. Any Postgres 18 works; with Docker:

```sh
docker run -d --name zenbu-account-db -e POSTGRES_USER=account -e POSTGRES_DB=account \
  -e POSTGRES_HOST_AUTH_METHOD=trust -p 5432:5432 postgres:18
cat > .env <<EOF
DATABASE_URL=postgres://account@localhost:5432/account
ACCOUNT_API_URL=http://localhost:8789
ACCOUNT_API_SECRET=$(openssl rand -hex 32)
ACCOUNT_API_EMAIL=dev-mailbox
EOF
pnpm dev
```

`trust` lets anyone on the machine in without a password, so keep it to a local database.
`pnpm dev` reads `.env` (gitignored), applies the migrations, and serves on port 8789, restarting
on every change. With `ACCOUNT_API_EMAIL=dev-mailbox`, no email leaves the machine: the codes it
would send are at `http://localhost:8789/dev/mail` (Email, below).

| Variable | Default | What it does |
| --- | --- | --- |
| `DATABASE_URL` | required | The Postgres database the service owns: `postgres://user:password@host:port/database`. It's never logged or repeated in an error. |
| `ACCOUNT_API_URL` | required | The service's own origin, such as `https://account-api.zenbujapanese.com`. Its access tokens name it as their issuer and audience. |
| `ACCOUNT_API_SECRET` | required | At least 32 characters. It signs sessions, and encrypts the token-signing keys and the providers' tokens in the database, so changing it signs everyone out. |
| `ACCOUNT_API_TRUSTED_ORIGINS` | none | The website origins, comma-separated, that may sign in with a cookie, such as `https://zenbujapanese.com`. |
| `ACCOUNT_API_COOKIE_DOMAIN` | none | The domain the session cookie is shared across, such as `zenbujapanese.com`, so the website on the zone's root reads it. |
| `APPLE_CLIENT_IDS`, `APPLE_CLIENT_SECRET`, `APPLE_APP_BUNDLE_IDENTIFIER` | off | Sign in with Apple: the Services IDs, the client secret (a JWT made with the Sign in with Apple key), and the iOS app's bundle ID, which a native sign-in's token names. |
| `GOOGLE_CLIENT_IDS`, `GOOGLE_CLIENT_SECRET` | off | Sign in with Google: the OAuth client IDs, comma-separated (the web client's and the iOS app's), and the web client's secret. |
| `ACCOUNT_API_EMAIL` | off | Who sends the codes: `cloudflare`, `usesend`, or, on a local run only, `dev-mailbox`. Off, the email sign-in answers `503 email_unavailable`. |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_EMAIL_TOKEN` | | For `cloudflare`: the account, and an API token that may only send email. |
| `USESEND_API_KEY` | | For `usesend`. |
| `EMAIL_FROM` | `Zenbu Japanese <support@zenbujapanese.com>` | The sender, which is also where replies go. |
| `EMAIL_ALLOWED_RECIPIENTS` | everyone | Staging's test recipients, comma-separated: addresses, or domains as `@example.com`. A code for anyone else isn't sent. |
| `PORT` | `8789` | The port it listens on. |
| `ACCOUNT_API_RELEASE` | `local` | The release `/healthz` names. The image sets it to its commit. |

## Routes

Every answer is JSON. An error is `{ "error": { "code": "...", "message": "..." } }`; a `500`
never says what went wrong inside, which only the log records.

| Route | What it answers |
| --- | --- |
| `GET /v1/health` | `{ "status": "ok" }`, or `503` with `{ "status": "unavailable" }` while the database doesn't answer. It names nothing else (#374). |
| `GET /healthz` | The same, with the release, for the deployer and the image's health check. |
| `POST /v1/auth/email-otp/send-verification-otp` | Emails a sign-in code: `{ "email": "...", "type": "sign-in" }`. It answers the same whether or not the email has an account. |
| `POST /v1/auth/sign-in/email-otp` | Signs in with the code: `{ "email": "...", "otp": "123456" }`. |
| `POST /v1/auth/sign-in/social` | Signs in with an ID token from Sign in with Apple or Google on the device: `{ "provider": "apple", "idToken": { "token": "...", "nonce": "..." } }`. |
| `POST /v1/auth/link-social` | Signed in, adds another way to sign in to the learner's account, the same way. |
| `GET /v1/auth/token` | Signed in, a 15-minute access token for the other services. |
| `GET /v1/auth/jwks` | The keys an access token is checked with. |
| `GET /v1/auth/get-session`, `POST /v1/auth/sign-out` | The session, and signing out of it. |
| `GET /dev/mail` | On a local run with the dev mailbox, and only to a request for the machine itself, the codes it would have sent. Elsewhere, `404`. |

Every route under `/v1/auth/` is Better Auth's, with its errors put in the format above, such as
`invalid_otp`, `oauth_link_error`, or `too_many_requests`.

## Sign-in

**What an app keeps.** A sign-in answers with the learner and, in the `set-auth-token` header, a
session token. The session token is the app's refresh token: it lasts 60 days from its last use,
and the app sends it as `Authorization: Bearer <token>` to this service only, to get access tokens
from `GET /v1/auth/token` and to sign out. An access token is an EdDSA JWT that names the account
(`sub`), the service (`iss` and `aud`, both `ACCOUNT_API_URL`), and when it expires, 15 minutes on:
nothing else, so a service that receives one learns only the account's ID. Another service checks
it against `GET /v1/auth/jwks`. Signing out ends the session, so its token gets no more access
tokens. The website signs in the same way, but keeps the session in a cookie on
`ACCOUNT_API_COOKIE_DOMAIN`, for the origins in `ACCOUNT_API_TRUSTED_ORIGINS`.

**One account per email, and no account taken over by one** (#374):

- The Zenbu user ID, a UUID, is the identity. Each way the learner signs in is a row in
  `user_identities`, unique by provider and subject: `apple` or `google` and the token's `sub`, or
  `email` and the address.
- A new Apple or Google sign-in whose email already has an account is refused
  (`oauth_link_error`), never linked by its email. The learner signs in the way they did before,
  then links the new way (`POST /v1/auth/link-social`).
- A code sent to an email signs in to that email's account, whichever way it was made, since
  reading the code proves the email.
- Apple's and Google's tokens are checked against their keys, issuer, audience, the nonce the app
  sent, and age: none older than an hour.

**Codes** are six digits, last 10 minutes, are stored only as a hash, and allow five wrong
guesses. **Rate limits**, kept in the database so they outlast a deploy, count by the address
Cloudflare reports (`CF-Connecting-IP`): five codes sent and ten tried per 10 minutes, twenty
Apple or Google sign-ins a minute, and 100 requests a minute to anything else under `/v1/auth/`.

## Email

The codes are sent as SERP's
[transactional email standard](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/transactional-email.md)
says (ADR 0011), by `src/email/mailer.ts`, the one function that sends:

- **Through Cloudflare Email Service's REST API**, from `EMAIL_FROM`, with no other `Reply-To`.
  `ACCOUNT_API_EMAIL=usesend` sends through useSend instead, with nothing else changed.
- **Staging sends only to its test recipients** (`EMAIL_ALLOWED_RECIPIENTS`), since the REST API's
  token can't restrict them the way a Worker binding does.
- **A local run never sends.** With `dev-mailbox`, a message is kept in memory and shown at
  `/dev/mail`, which answers only on a local run, and only to a request for `localhost`,
  `127.0.0.1`, or `[::1]`. The image runs with `NODE_ENV=production`, and refuses to start with
  `dev-mailbox`.
- **Nothing logs a recipient, a code, or a link**: only "sent", "captured", "skipped", or "failed",
  with the sender and a status or the error's kind.

The service doesn't wait for the email before it answers, so how long it takes doesn't show
whether an email has an account.

## Code layout

`apps/account-api/src` is in layers. Biome's `noRestrictedImports` enforces each rule
(`apps/account-api/biome.json`), and `pnpm verify` enforces them again by resolved path, so a file
in a subfolder is held to them too ([`code.md`](code.md), Checks). Each says where the code
belongs; tests may import anything.

- **`src/http`** is the HTTP layer, in Hono. It answers from what `src/server.ts` hands it (the
  database's state, the sign-in handler, and the dev mailbox), and imports none of them.
- **`src/auth`** sets up Better Auth on the database and the mailer. It knows nothing of HTTP.
- **`src/email`** sends a message, and imports neither sign-in, the database, nor HTTP.
- **`src/domain`** will hold the account and sync rules (#567), which the others build on, so it
  imports none of them, nor Hono, nor a database driver.
- **`src/db`** is the database layer: Drizzle ORM over `pg`, the schema, and the migrations. It
  knows nothing of HTTP or sign-in.

`src/config.ts` reads the environment, and `src/server.ts` wires the layers together and is
imported by nothing. Logging, the request log, and stopping cleanly on SIGTERM come from
`packages/node-service`, as in the dictionary service ([`dictionary-api.md`](dictionary-api.md),
Code layout). Nothing calls `console`, and nothing logs a learner's email, a code, a token, or a
link: only what happened, as SERP's
[transactional email standard](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/transactional-email.md)
says for email.

## The database

The service owns one Postgres 18 database per environment, and only it connects to it. Its tables
are in `src/db/schema.ts`:

- `users`: the account (a UUID, its name and email, and whether the email is verified);
- `user_identities`: each way an account signs in;
- `sessions`: what an app or the website holds;
- `verifications`: the codes, hashed;
- `signing_keys`: the access tokens' keys, encrypted with `ACCOUNT_API_SECRET`;
- `rate_limits`.

Better Auth names its models `user`, `account`, `session`, `verification`, and `jwks`. The schema
maps them to these tables, and `account` to #374's `user_identities`, whose `provider` and
`subject` are Better Auth's `providerId` and `accountId`.

The migrations are in `apps/account-api/migrations/`, in Drizzle's format. To change the schema,
change `src/db/schema.ts`, then run `pnpm db:generate --name <what it does>` and commit the SQL and
`meta/` files it writes. They're drizzle-kit's, as it writes them, comments and formatting
included, so Biome and the comments check leave the folder alone.

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
the service's own `pg` driver connects to. The sign-in tests (`src/auth/auth.test.ts`) run the
whole service with the dev mailbox, and stand in for Apple's and Google's signing keys at their
own URLs, so Better Auth's checks of a real token run. They sign new and existing learners in each
way, and refuse:

- an expired token, one older than an hour, one for another app or from another issuer, a forged
  one, a malformed one, and one for another nonce;
- a code used twice, and a sixth code sent from one address in 10 minutes;
- a second way in with an account's email, until it's linked;
- a session's token after signing out. Set `ACCOUNT_API_TEST_DATABASE_URL` to an empty
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
3. **Sign-in's settings**, in each environment's file (the settings table, above). An environment
   without its file isn't deployed, and the deployer deploys an environment again when its file
   changes, so a setting added later takes effect within 5 minutes.
   - **The service:** `ACCOUNT_API_URL` (`https://account-api-staging.zenbujapanese.com` or
     `https://account-api.zenbujapanese.com`), a new `ACCOUNT_API_SECRET` for each environment
     (`openssl rand -hex 32`), and, for the website (#468), `ACCOUNT_API_TRUSTED_ORIGINS` and
     `ACCOUNT_API_COOKIE_DOMAIN=zenbujapanese.com`.
   - **Apple** (Apple Developer):
     - Sign in with Apple on the iOS app's App ID (`com.zenbujapanese.dictionary`).
     - A Services ID for the website, whose return URL is `<ACCOUNT_API_URL>/v1/auth/callback/apple`.
     - A Sign in with Apple key, from which the client secret is made: a JWT that lasts at most
       six months, so it's made again before then.

     Then set `APPLE_CLIENT_IDS` (the Services ID), `APPLE_CLIENT_SECRET`, and
     `APPLE_APP_BUNDLE_IDENTIFIER`.
   - **Google** (Google Cloud, OAuth clients):
     - a web client, whose redirect URI is `<ACCOUNT_API_URL>/v1/auth/callback/google`;
     - an iOS client, for the app's bundle ID.

     Then set `GOOGLE_CLIENT_IDS` (the web client's, then the iOS client's) and
     `GOOGLE_CLIENT_SECRET` (the web client's).
   - **Email**, as SERP's transactional email standard says:
     1. `support@zenbujapanese.com` receives mail before anything sends from it: Email Routing
        forwards it to `support+zenbujapanese@serp.co`.
     2. Onboard `zenbujapanese.com` in Cloudflare (Compute → Email Service → Email Sending), which
        adds its SPF, DKIM, DMARC, and bounce records and needs the Workers Paid plan.
     3. Make an API token that may only send email.
     4. Set `ACCOUNT_API_EMAIL=cloudflare`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_EMAIL_TOKEN`.
        On staging, also set `EMAIL_ALLOWED_RECIPIENTS` to the testers.

     The first code staging sends shows whether Email Service takes the sender's name with its
     address (`Zenbu Japanese <support@zenbujapanese.com>`); if it doesn't, set `EMAIL_FROM` to the
     address alone.
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
     Mode challenges it, the owners turn Bot Fight Mode off (ADR 0011), and this doc says so.
   - Run the backup by hand (`sudo zenbujapanese-account-backups`), then restore it into a new
     database (Back up and restore, above).
   - On staging, each way signs in a new learner and an existing one: a code, Apple and Google in
     the app, and Apple and Google on the website once #468 has its pages. The same email through a
     second way is refused until it's linked. An access token from `GET /v1/auth/token` checks out
     against `GET /v1/auth/jwks`.
