# Account service

`apps/account-api` is where Zenbu accounts, sign-in, and sync run: a Node service with its own
Postgres database, beside the dictionary service on the API servers
([ADR 0012](../adr/0012-run-accounts-and-sync-in-their-own-service-on-the-api-servers.md)). It signs
learners in with Apple, Google, or a code sent by email, through Better Auth, and issues the tokens
the apps and other services use. Signed-in apps read and change the learner's profile at
`/v1/me`, and keep their copies in step with `/v1/sync`
([#567](https://github.com/serpcompany/zenbujapanese-monorepo/issues/567)). Every Zenbu app stays
local-first, so nothing in an app waits on this service.

Clients reach it at the API host, `api.zenbujapanese.com`, which it shares with the dictionary
service: nginx sends it `/v1/auth`, `/v1/me`, `/v1/sync`, and `/v1/health`
([`api-servers.md`](api-servers.md), The API host).

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
| `ACCOUNT_API_URL` | required | The API host's origin, such as `https://api.zenbujapanese.com`. Its access tokens name it as their issuer and audience. |
| `ACCOUNT_API_SECRET` | required | At least 32 characters. It signs session tokens and encrypts the codes and the token-signing keys in the database. Changing it signs everyone out, and needs `delete from signing_keys` too, or no access token can be made. |
| `ACCOUNT_API_TRUSTED_ORIGINS` | none | The website origins, comma-separated, that may sign in with a cookie, such as `https://zenbujapanese.com`. |
| `ACCOUNT_API_COOKIE_DOMAIN` | none | A domain to share the session cookie across, such as `zenbujapanese.com`. Leave it unset: the website's pages call the service from the browser (#468), so the cookie stays on the API host, and the website's Worker and pages never get it. |
| `ACCOUNT_API_COOKIE_PREFIX` | `zenbu` | The start of the cookies' names. Staging sets `zenbu-staging`, so its cookies and production's could never overwrite each other, even on a shared domain. |
| `APPLE_APP_BUNDLE_IDENTIFIER` | off | Sign in with Apple in the app: the bundle ID its tokens name. The app needs nothing else. |
| `APPLE_SERVICES_IDS`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | off | Sign in with Apple on the web: the Services IDs, and the team, key ID, and `.p8` key (with its newlines written as `\n`) the service makes Apple's client secret from each time it starts. The secret lasts 180 days, so a service that runs that long without a deploy is restarted. |
| `GOOGLE_CLIENT_IDS`, `GOOGLE_CLIENT_SECRET` | off | Sign in with Google: the OAuth client IDs, comma-separated (the web client's and the iOS app's), and the web client's secret. |
| `ACCOUNT_API_EMAIL` | off | Who sends the codes: `usesend`, as staging and production do; `cloudflare`, which works but isn't used; or, on a local run only, `dev-mailbox`. Off, asking for a code answers `503 email_unavailable`. |
| `USESEND_API_KEY` | | For `usesend`: a useSend API key that sends from `zenbujapanese.com`. |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_EMAIL_TOKEN` | | For `cloudflare`: the account, and an API token that may only send email. |
| `EMAIL_FROM` | `Zenbu Japanese <support@zenbujapanese.com>` | The sender, which is also where replies go. Any address but `support@zenbujapanese.com` is refused. |
| `EMAIL_ALLOWED_RECIPIENTS` | required to send | Who may be emailed: on staging, the testers, comma-separated (addresses, or domains as `@example.com`); in production, `everyone`. With `cloudflare` or `usesend` and nothing here, the service doesn't start, so staging never emails a stranger. |
| `PORT` | `8789` | The port it listens on. |
| `ACCOUNT_API_RELEASE` | `local` | The release `/healthz` names. The image sets it to its commit. |

## Routes

Every answer is JSON, but for the web sign-in's redirects. An error is
`{ "error": { "code": "...", "message": "..." } }`; a `500` never says what went wrong inside,
which only the log records.

| Route | What it answers |
| --- | --- |
| `GET /v1/health` | `{ "status": "ok" }`, or `503` with `{ "status": "unavailable" }` while the database doesn't answer. It names nothing else (#374). |
| `GET /healthz` | The same, with the release, for the deployer and the image's health check. |
| `GET /v1/me` | With an access token, the learner's profile: `id`, `name`, `username`, `email`, `version`, `createdAt`, and `updatedAt`. |
| `PATCH /v1/me` | With an access token, changes the name, the username, or both: `{ "baseVersion": 3, "name": "...", "username": "..." }`. It answers `409 version_conflict`, with the profile as it is now in `current`, if the profile has moved past `baseVersion`, and `409 username_taken`. |
| `POST /v1/sync` | With an access token, applies the device's changes and answers what changed after its cursor (Profiles and sync, below). |
| `DELETE /v1/me` | With an access token from a sign-in in the last 10 minutes, deletes the account: `{ "confirm": true }`, and for an account that signs in with Apple, `"appleAuthorizationCode"` from that sign-in, with the website's `"appleRedirectUri"` (Deleting an account, below). |
| `POST /v1/auth/email-otp/send-verification-otp` | Emails a sign-in code: `{ "email": "...", "type": "sign-in" }`. It answers the same whether or not the email has an account. |
| `POST /v1/auth/sign-in/email-otp` | Signs in with the code: `{ "email": "...", "otp": "123456" }`. |
| `POST /v1/auth/sign-in/nonce` | A nonce for one Apple or Google sign-in: `{ "nonce": "...", "expiresIn": 600 }`. |
| `POST /v1/auth/sign-in/social` | Signs in with an ID token from Sign in with Apple or Google on the device, with the nonce: `{ "provider": "apple", "idToken": { "token": "...", "nonce": "..." } }`. Without an ID token, it starts the web sign-in, which comes back to `/v1/auth/callback/<provider>`. |
| `POST /v1/auth/link-social` | Signed in within the last 10 minutes, adds another way to sign in, the same way. |
| `GET /v1/auth/list-accounts`, `POST /v1/auth/unlink-account` | Signed in, the ways the learner signs in, and removing one by its `id` from the list: `{ "accountId": "..." }`, within 10 minutes of signing in, never the last, and the account's email is told. |
| `GET /v1/auth/token` | Signed in, a 15-minute access token for the other services. |
| `GET /v1/auth/jwks` | The keys an access token is checked with. |
| `GET /v1/auth/get-session`, `POST /v1/auth/sign-out` | The session, and signing out of it. |
| `GET /v1/auth/list-sessions`, `POST /v1/auth/revoke-session`, `/revoke-sessions`, `/revoke-other-sessions` | Signed in, where the learner is signed in, and signing out of those. |
| `GET /dev/mail` | On a local run with the dev mailbox, the codes it would have sent. Elsewhere, `404`. |

The routes under `/v1/auth/` are Better Auth's, with its errors put in the format above, such as
`invalid_otp`, `oauth_link_error`, or `too_many_requests`. Only the routes above are open: Better
Auth has more (passwords, changing or verifying an email, editing or deleting the account), and
`src/auth/routes.ts` lists the open ones, so every other answers `404 not_found`, including those a
Better Auth upgrade adds. The profile changes through `/v1/me`, and deleting an account is #574's.

**Apps and scopes.** Each app that signs in is listed in `src/domain/clients.ts`, with its scopes
and its Apple bundle IDs (#570). A sign-in names its app in the `X-Zenbu-Client` header, or comes
from one of the website's origins, or is refused (`unknown_client`); an Apple token made for
another app's bundle ID is refused (`client_mismatch`). The session keeps its app (`client_id`),
and its access tokens carry the app (`azp`) and its scopes (`scope`), cut to the scopes the app
has now. `/v1/me` needs `profile` (`403 insufficient_scope`), and sync checks each change against
the scopes and reads only the entities they allow. The sign-in routes that manage the account
(linking, unlinking, listing ways in and sessions, and signing sessions out) need the session's
app to have `account`, and `get-session`, which shows the email and name, needs `profile`; a
session whose app isn't listed gets no access token (`401 sign_in_again`). At most five sign-in
codes go to one email in 10 minutes, from any address, counting only codes sent; the next gets
`429 too_many_requests` with `Retry-After` and `X-Retry-After`, the seconds until one ages out. The
apps' side, and how to add one, is the
[client guide](account-clients.md).

`/v1/me` and `/v1/sync` take only an access token from `GET /v1/auth/token`, as
`Authorization: Bearer <token>`, checked against the service's own JWKS. They refuse the session
token, so the long-lived token only ever goes to `/v1/auth`, and they answer every refusal alike:
`401 unauthorized`, with `WWW-Authenticate: Bearer`. Their bodies, and those sent to `/v1/auth`,
are at most 64 KB (`413 too_large`). Each account may send 60 requests a minute to `/v1/me` and
120 to `/v1/sync` from each app, and each app 30,000 a minute from all its accounts together
(`429 too_many_requests`, with `Retry-After`), counted in each slot's memory, so an app stuck in a
loop, or a stolen access token, can't flood the service. A browser can call the
service only from the origins in `ACCOUNT_API_TRUSTED_ORIGINS`: CORS names each one, never `*`,
and lets the page read `Retry-After` and Better Auth's `X-Retry-After`.

**The contract** for every route above is
[`apps/account-api/openapi.json`](../../apps/account-api/openapi.json), OpenAPI 3.1, and its
readable form is the [API reference](../api/account-api.md), which
`packages/node-service/src/api-reference.ts` writes from it. A test writes each file and fails when
it differs: after changing a route, run `pnpm test -u` and commit both files with their diff.

- `/v1/health`, `/v1/me`, and `/v1/sync` are declared with `@hono/zod-openapi`, so the schemas
  that check each request are the ones the contract shows.
- Each route names the scope it needs (its `security`), and each error answer the codes it can
  carry (an `enum`), with what each means, from `src/http/refusals.ts`. A test calls each route
  with a token that lacks its scope, and with one that has only that scope.
- Sync's entities are `x-sync-entities` on the `Mutation` schema (`src/http/sync-entities.ts`):
  each entity's ID, read scope, and data, and each operation's scopes (from the domain), fields,
  whether it reads `baseVersion`, and an example. `x-sync-rejections` holds every code a rejected
  mutation can carry. A test holds the entities and operations to the domain's, sends every
  example to the service, which applies each, and sends each operation that reads `baseVersion`
  without it, which is refused.
- Sign-in's routes are Better Auth's, declared in `src/http/sign-in-contract.ts`. A test holds the
  list to `src/auth/routes.ts`, and calls each route to check its answer against what's
  declared.

## Sign-in

**What an app keeps.** A sign-in answers with the learner and, in the `set-auth-token` header, a
session token. That header's token, which is signed, is the app's refresh token. The `token` in
the answer's body is the same token unsigned, which the service refuses, so a copy of the
database's session rows can't be used either. The session token lasts 60 days from its last use,
and the app sends it as `Authorization: Bearer <token>` to this service only, to get access tokens
from `GET /v1/auth/token` and to sign out. An access token is an EdDSA JWT that names the account
(`sub`), the service (`iss` and `aud`, both `ACCOUNT_API_URL`), the app and its scopes (`azp` and
`scope`), when the learner signed in (`auth_time`), and when it expires, 15 minutes on. It holds no
email or profile, so a service that receives one learns only the account's ID, its app, and its
scopes. Another service checks it against `GET /v1/auth/jwks`. Signing out ends the session, so its
token gets no more access tokens.

**The website** signs in the same way from the learner's browser, on an origin in
`ACCOUNT_API_TRUSTED_ORIGINS`, and its session stays in a cookie
(`src/auth/website.test.ts`): `<prefix>.session_token`, with `__Secure-` in front over https,
HttpOnly, `SameSite=Lax`, for 60 days from its last use, on the API host alone unless
`ACCOUNT_API_COOKIE_DOMAIN` is set. A Google sign-in adds `<prefix>.state` for its 5 minutes. A
sign-in from one of those origins answers no `set-auth-token`, so the page never holds the signed
session token, only the session's bare one that `get-session` shows, which signs nothing in; the
browser sends the cookie to `/v1/auth`, and the page sends its access token to `/v1/me`. A refused
answer to one of those origins sets no cookie: refusing an email code into an account Apple or
Google made deletes the session it had made, and its cookie would replace the browser's own.
The website's side is in the [client guide](account-clients.md#the-website).

**Apple and Google, in the app.** The app asks this service for a nonce, gives it to Apple (as its
SHA-256, as Apple asks) or Google, and sends the token it gets back with the nonce. Each nonce
lasts 10 minutes and signs in once, so a token someone captures can't be used again. The token is
checked against the provider's keys, issuer, audience (`APPLE_APP_BUNDLE_IDENTIFIER` and
`APPLE_SERVICES_IDS`, or `GOOGLE_CLIENT_IDS`), the nonce, and its age: none older than an hour. An
account is made only for an email the provider has verified. The providers' own tokens aren't
kept.

**One account per email, and no account taken over by one** (#374, ADR 0012):

- The Zenbu user ID is the identity. Each way the learner signs in is a row in `user_identities`,
  unique by provider and subject: `apple` or `google` and the token's `sub`, or `email` and the
  address.
- A new Apple or Google sign-in whose email already has an account is refused
  (`oauth_link_error`), never linked by its email.
- So is an email code for an account Apple or Google made (`account_not_linked`): reading the
  code proves the inbox, not the account. The session it would have made is deleted.
- The learner adds a way while signed in, in the last 10 minutes: Apple or Google through
  `POST /v1/auth/link-social`, or email by signing in with a code while sending their session.
  So a stolen older session can't add a way in. The account's email is told of each way added.

**Codes** are six digits, last 10 minutes, are stored only encrypted, and allow five wrong
guesses. **Rate limits**, kept in the database so they outlast a deploy, count by the address
Cloudflare reports (`CF-Connecting-IP`): five codes sent and ten tried per 10 minutes, 30 nonces
and twenty Apple or Google sign-ins a minute, Better Auth's own tighter limits on some routes, and
100 requests a minute to the rest. Each answers `429 too_many_requests` with `Retry-After`: Better
Auth sends only `X-Retry-After`, so the service copies it (`src/http/errors.ts`). Only Cloudflare can set `CF-Connecting-IP` for a request that reaches
the service, since nginx takes only Cloudflare's client certificate (Authenticated Origin Pulls,
[`api-servers.md`](api-servers.md)). A request without it counts in one bucket shared by every
such request.

## Email

The codes are sent as SERP's
[transactional email standard](https://github.com/serpcompany/serp/blob/main/docs/engineering/standards/transactional-email.md)
says (ADR 0012), by `src/email/mailer.ts`, the one function that sends:

- **Through useSend's hosted API** (`https://app.usesend.com/api/v1/emails`), as serplists.com
  sends, from `EMAIL_FROM`, with no other `Reply-To`, in staging and production. The owners chose
  it on 2026-10-07: "the plan is updated to use usesend like serplists does"
  ([ADR 0012](../adr/0012-run-accounts-and-sync-in-their-own-service-on-the-api-servers.md),
  Amendment). `ACCOUNT_API_EMAIL=cloudflare` sends through Cloudflare Email Service's REST API
  instead, with nothing else changed; it still works, but isn't used.
- **From the support address only.** `EMAIL_FROM` is refused unless it's
  `support@zenbujapanese.com`, which an API key can't enforce the way a Worker binding does.
- **Staging sends only to its test recipients.** `EMAIL_ALLOWED_RECIPIENTS` names them, and the
  service won't start with a sender and no list; production sets `everyone`.
- **A local run never sends.** With `dev-mailbox`, a message is kept in memory and shown at
  `/dev/mail`, and the service listens on `127.0.0.1` only, so nothing off the machine reaches
  it. The image runs with `NODE_ENV=production`, and refuses to start with `dev-mailbox`.
- **Nothing logs a recipient, a code, or a link**: only "sent", "captured", "skipped", or "failed",
  with the sender and a status or the error's kind.

The service doesn't wait for the email before it answers, so how long it takes doesn't show
whether an email has an account.

## Profiles and sync

Four entities sync: the profile, known words, lists, and the words in each list (#572). Each has
its own rule in `src/domain`, never blanket last-write-wins, and none needs a clock: a change says
the version it was made to, and the rule decides what a stale one does. `PATCH /v1/me` and a sync
mutation change the profile through the same rule.

- **Known word** (`knownWord`, by item: a Language Reference ID, or `kanji:` and the kanji in
  Unicode NFC, as the iOS app keys `word-knowledge.json`): `mark` and `clear` apply only at the word's current
  version (0 for one never seen), and marking a known word or clearing one not known changes
  nothing. So a mark made before the learner cleared the word loses to the clear, and a mark made
  after seeing the clear wins, as #563's decision 4 says for Tomodachi. A clear that never saw a
  later mark conflicts, and the learner sees the word Known again.
- **List** (`list`, by its UUID, in either case, as Swift writes it uppercase; answers name it in
  lowercase): `create` with a name and a position, then `update` at the current version, so two
  renames conflict and the second gets the name as it is now. An update that already matches the
  list is applied. A name is the app's rule: 1 to 500 characters once trimmed, with control
  characters made spaces, so nothing the app makes is refused. `delete` wins over everything done
  to the list since, renames and words added elsewhere too: the learner deleted it. It takes the
  list's words with it, and its ID can't be used again.
- **List word** (`listWord`, `<list>/<item>`): `add` always applies, and `remove` applies only at
  the current version, so it removes only an add it saw: an add the remover never saw wins.
- **Limits:** 500 lists an account and 5,000 words a list (`too_many_lists`, `list_full`); a
  word added to a deleted or unknown list is rejected (`unknown_list`).
- **Each keeps its history** as its version and a row that stays (a cleared word, a deleted list,
  a removed list word), so a stale change finds the version it lost to. A deleted list's words are
  deleted with it, and its row keeps no name.
- **Order:** on a page, lists come before their words, but a list word can come a page before its
  list, since the journal keeps each entity's latest change. A client holds such a word until the
  sync reaches `hasMore: false`. A rejected change (`unknown_list`, say) is undone on the device.

- **A name** is 1 to 100 characters once trimmed, with runs of spaces made one and no control or
  invisible format characters, kept in Unicode NFC. A name given at sign-up, by the learner or by
  Apple or Google, is held to the same rule, and is left empty if it fails it. So is a picture's
  address, which must be `https` and at most 2,048 characters, or is left out.
- **A username** is 3 to 30 letters a to z, digits, or underscores, after Unicode NFKC, trimming,
  and lowercasing (`Kana_Fan` is `kana_fan`), unique across accounts, or `null`.
- **The email** doesn't change here: changing it needs proof that the learner owns the new
  address, which nothing builds yet.
- **Versions.** A profile starts at version 1, and each change adds one. On a restored copy it
  jumps to the time, in milliseconds (Back up and restore). A change names the
  version it was made to (`baseVersion`); if the profile has moved on, nothing changes, and the
  answer is the profile as it is now. Nothing is last-write-wins. Sending the current values
  again changes nothing.
- **The journal**, `sync_changes`, holds each entity's latest change: a change replaces the
  entity's row, and a new account gets one from a trigger on `users`, so an account Better Auth
  makes is in it too. A sync answers each entity as it is now, so the older rows were never
  needed, and the journal grows with an account's entities, not its changes. The trigger names the profile
  in SQL, and the first-sync test fails if it and the domain disagree. Every write to an account's
  journal holds that account's `users` row locked, so its entries commit in the order of their
  sequence, which the cursor relies on.
- **A sync** applies its mutations in order, each in its own transaction. Then it reads up to
  `limit` of the account's journal entries after the cursor (100 unless the request says, at most
  500), and answers each entity they name once, as it is now. While `hasMore` is true, the client
  syncs again with the new cursor.
- **Mutation IDs.** `sync_mutations` keeps the result of each mutation by the ID the client gave
  it: applied, conflict, or rejected. The same mutation sent again under its ID applies nothing
  and gets the same outcome: applied at the same version, a conflict with the entity as it is
  then, or a rejection with the same code. A different mutation under a used ID is rejected
  (`mutation_id_reused`). A result is final: to try again, the client sends a new mutation with a
  new ID. Each mutation commits on its own, so after a failure partway through a batch, sending
  the batch again answers the ones that applied and applies the rest. A result is kept 30 days,
  then forgotten at the account's next mutation: a mutation sent again later is answered as new.
  Most then conflict or change nothing; a list word added again after a remove is back.
- **Fields** a mutation sends are strings, numbers, booleans, or null, and its entity, operation,
  and entity ID are plain printable text, so nothing a client sends can fail to store or hash.
- **Unknown entities and operations** are rejected one by one, and the rest still apply, so an
  older service can answer a newer app.
- **The cursor** is opaque: a journal position, encrypted and authenticated (AES-256-GCM) for the
  account with a key derived from `ACCOUNT_API_SECRET`, so it shows nothing of the journal, and a
  sync that reads nothing new answers the cursor it was sent. A cursor another account was given,
  or one past the end of the journal, as when an environment goes back to a database it left, is
  refused with `410 invalid_cursor` before anything applies. The client then syncs from no cursor
  and keeps what comes back. Changing the secret makes every client do that once.
- **Request limits:** 50 mutations, a 64 KB body, and 500 journal entries a request.

## Deleting an account

Any app that can make an account can delete it (App Review guideline 5.1.1(v), #574), so every app
has `account:delete`, Tomodachi too. `DELETE /v1/me` needs the learner to confirm in the app
(`{ "confirm": true }`) and a sign-in from the last 10 minutes, which the access token's
`auth_time` names (`403 sign_in_again`). A token from before `auth_time` existed works everywhere
else, and deletes only after a fresh sign-in.

- **Apple.** An account that signs in with Apple sends the authorization code from that fresh Sign
  in with Apple. Before deleting anything, the service exchanges it at Apple for a refresh token,
  as the app's bundle ID, or as the website's Services ID with the return URL the code was made
  for, checks that Apple's answer names one of the account's Apple IDs, and revokes the token, as
  App Review requires; it keeps no Apple token otherwise. The website's Sign in with Apple popup
  names a return URL on the website, `<site>/account/`, and the website sends it as
  `appleRedirectUri`, which must be on one of `ACCOUNT_API_TRUSTED_ORIGINS` (`400 bad_request`);
  without it, the website's code is taken as one Apple sent to `/v1/auth/callback/apple`. So the
  service needs Apple's key wherever Apple sign-in is set up: it refuses to start without one, but
  at `localhost`, where it skips Apple. The answers:
  - no code: `400 apple_authorization_needed`;
  - a code Apple has used or expired: `400 apple_authorization_invalid`;
  - a code from another Apple ID: `400 apple_account_mismatch`, after revoking what it made,
    unless another account signs in with that Apple ID, whose grant it leaves alone;
  - anything else, Apple down or refusing the key: `503 apple_unavailable`, with nothing deleted,
    and the key's refusal logged as an error. The code may be used up, so the app gets a new one
    by signing in with Apple again.
- **What goes:** the account's row, and with it, by cascade, its ways to sign in, its sessions,
  its synced profile, known words, lists, and list words, its journal, and its mutation results;
  and any sign-in code waiting for its email. Its access tokens stop working at `/v1/me` and
  `/v1/sync` at once (the account is gone), and expire within 15 minutes everywhere else. The
  account's email is told. Backups that hold it are deleted within 30 days (Back up and
  restore).
- **Each device** keeps its own data and works signed out, as the apps' product docs say.
- **Signing in again** with the same email or Apple or Google account makes a new account.

The service also deletes expired sessions, expired sign-in codes and nonces, and rate-limit counts
over a day old, when it starts and every hour (`src/db/housekeeping.ts`).

## Code layout

`apps/account-api/src` is in layers. Biome's `noRestrictedImports` enforces each rule
(`apps/account-api/biome.json`), and `pnpm verify` enforces them again by resolved path, so a file
in a subfolder is held to them too ([`code.md`](code.md), Checks). Each says where the code
belongs; tests may import anything.

- **`src/http`** is the HTTP layer, in Hono, with `/v1/me` and `/v1/sync` declared for the
  contract (`accounts.ts`, `schemas.ts`), their refusals (`refusals.ts`), and sync's entities as
  the contract shows them (`sync-entities.ts`). It answers from what `src/server.ts` hands it (the
  database's state, the sign-in handler, the access-token check, the account rules, and the dev
  mailbox), and imports none of them but the domain.
- **`src/auth`** sets up Better Auth on the database and the mailer: its routes under
  `/v1/auth`, which are open (`routes.ts`), the guards that hold this doc's rules
  (`guards.ts`, a Better Auth plugin after `bearer`, so it sees the bearer session), the nonce
  (`nonce.ts`), what an identity may hold (`identities.ts`), which app a sign-in is and what its
  tokens carry (`clients.ts`), and the access-token check the other routes use
  (`access-tokens.ts`). It imports nothing of the HTTP layer.
- **`src/email`** sends a message, and imports neither sign-in, the database, nor HTTP.
- **`src/domain`** holds the account's rules: the apps and their scopes (`clients.ts`), a
  profile's fields, each synced entity's rule, versions and conflicts, the cursor, and the results
  kept by mutation ID. It works through the store it's handed
  (`store.ts`), so it imports no other layer, nor Hono, nor a database driver.
- **`src/db`** is the database layer: Drizzle ORM over `pg`, the schema, the migrations, and the
  store the domain works through (`accounts.ts`). It knows nothing of HTTP or sign-in.

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

- `users`: the account (Better Auth's random ID, its name and email, unique whatever its case,
  whether the email is verified, the username, unique, and the profile's version);
- `user_identities`: each way an account signs in;
- `sessions`: what an app or the website holds, and which app (`client_id`);
- `verifications`: the codes, encrypted, and the sign-in nonces;
- `signing_keys`: the access tokens' keys, encrypted with `ACCOUNT_API_SECRET`;
- `rate_limits`;
- `known_words`, `word_lists`, and `list_words`: the synced known words, lists, and their words,
  each with its version;
- `sync_changes`: the journal, read by account and sequence;
- `sync_mutations`: each sync mutation's result, by account and the client's mutation ID;
- `sync_origin`: the OID of the database the service last started on, which tells it a restored
  copy (Back up and restore).

Better Auth names its models `user`, `account`, `session`, `verification`, and `jwks`. The schema
maps them to these tables, and `account` to #374's `user_identities`, whose `provider` and
`subject` are Better Auth's `providerId` and `accountId`.

The migrations are in `apps/account-api/migrations/`, in Drizzle's format. To change the schema,
change `src/db/schema.ts`, then run `pnpm db:generate --name <what it does>` and commit the SQL and
`meta/` files it writes. Never edit or regenerate a migration once it has run anywhere: Drizzle
runs only those dated after the last one a database ran, so an edited one never runs where the old
one did, and a regenerated one, with a new date, runs again over the tables it made. Add a new one. For
SQL drizzle-kit doesn't write, such as the journal's trigger, run `pnpm db:generate --custom --name
<what it does>` and write it into the empty file. They're drizzle-kit's, comments and formatting
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
the service's own `pg` driver connects to. The sign-in tests (`src/auth/`) run the whole service with the dev mailbox, and stand in for
Apple's and Google's signing keys at their own URLs, so Better Auth's checks of a real token run.
They sign new and existing learners in each way, and refuse:

- an expired token, one older than an hour, one for another app or from another issuer, a forged
  one, a malformed one, one for another nonce, one with no nonce, and one sent again;
- an unverified provider email, and a provider that isn't set up;
- a code used twice, a sixth code sent from one address in 10 minutes, and every kind of code but
  sign-in's;
- a second way in with an account's email, and an email code into an account Apple or Google made,
  until the signed-in learner adds it, and adding one with a session over 10 minutes old;
- a session's token after signing out, and the unsigned token;
- every Better Auth route that isn't open.

The profile and sync tests (`src/http/me.test.ts` and `sync.test.ts`) sign learners in the same
way and call the routes with their access tokens. They show:

- **Access:** the session token, a token signed with another key, a forged one, a malformed one,
  an expired one, and one for a deleted account are all refused alike, and `X-User-Id` lets no one
  in.
- **Profiles:** a change's normalized fields, its version and `updatedAt` moving on, an unchanged
  write, a stale version's conflict with the current profile, three changes from one version at
  once (one goes through), a username taken whatever its case, and each refused field.
- **Sync:** a new device's first sync, then only newer changes; one journal row per entity;
  paging; queued mutations applied in order; a retry applied once and answered the same; a
  conflict, again on a retry; unknown entities and operations, and a reused ID, rejected while the
  rest apply; and a result forgotten after 30 days.
- **Bounds:** another account's profile, cursor, and mutation IDs out of reach; a forged or
  too-new cursor refused before anything applies; the request bounds, and fields that nest or hold
  control characters; and logs that hold no profile, email, or token.
- **Edges:** a name given at sign-up held to the rules, and fields sign-up has no say in ignored;
  a repeat sign-in leaving the profile; a deleted account refused at both routes; a batch that
  fails partway, sent again; and each account's rate limits.

The domain's own tests (`src/domain/`) cover the name and username rules and the cursor;
`src/db/database.test.ts` covers the journal's trigger and backfill, the sync tables' rules, and
fencing two restored copies of one backup; and
`src/http/openapi.test.ts` keeps `openapi.json` and the API reference in step with the routes and
checks each route's scope, `src/http/sync-entities.test.ts` sends each documented sync example, and
`src/http/sign-in-contract.test.ts` holds each sign-in answer, and each sign-in route's scope, to
the contract. In CI, and when
`ACCOUNT_API_TEST_DATABASE_URL` names a real Postgres database, `src/db/postgres.test.ts` also
sends eight changes to one account at once through the `pg` pool, and one mutation six times at
once: one change goes through, and the mutation applies once.

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
runners: check `https://api-staging.zenbujapanese.com/v1/health` in a browser.

- **Roll back** by running the workflow by hand with `tag` set to the version to go back to, such
  as `sha-0123456789ab`. A migration doesn't roll back: an older image runs against the newer
  schema, which add-first migrations keep working.
- **See what runs and retry a failed image** as [`api-servers.md`](api-servers.md) says, with
  `zenbujapanese.account-api.slot`, `journalctl -t zenbujapanese-account-api`, and
  `/var/lib/zenbujapanese-account-api/`.

## Back up and restore

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

To run an environment on a restored database, point its `DATABASE_URL` at it (Set up the server,
step 2). The deployer sees the environment's file change and deploys it again within 5 minutes, as
it would a new image, with no request dropped ([`api-servers.md`](api-servers.md), The deployer).
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

What changed after the backup is lost, as for any restore. The first time the service starts on
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

## Set up the server

First set up what the services share: cosign, the deployer, and the registry token, with
`service=account-api` ([`api-servers.md`](api-servers.md), Set up the server). Then, as root, in
this order; each step says how to check it worked.

1. **Postgres 18**, alone on an internal network, so only the service's slots reach it. Its data
   lives in a host folder, `/home/daftadmin/data/zenbu-account-api`, mounted at
   `/var/lib/postgresql`: the Postgres 18 image keeps its data (`PGDATA`) in
   `/var/lib/postgresql/18/docker` and runs as uid 999, so the folder is made owned by 999. The
   deployer and `backups.sh` find the database by its container name alone, so the folder can
   move without changing them.
   ```sh
   sudo install -d -m 700 /etc/zenbujapanese-account-db
   printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 24)" |
     sudo tee /etc/zenbujapanese-account-db/postgres.env >/dev/null
   sudo chmod 600 /etc/zenbujapanese-account-db/postgres.env
   sudo install -d -o 999 -g 999 -m 700 /home/daftadmin/data/zenbu-account-api
   docker network create --internal zenbujapanese-account-db
   docker run -d --name zenbujapanese-account-db --restart unless-stopped \
     --network zenbujapanese-account-db \
     --volume /home/daftadmin/data/zenbu-account-api:/var/lib/postgresql \
     --env-file /etc/zenbujapanese-account-db/postgres.env --memory 1g --shm-size 256m postgres:18
   until docker exec zenbujapanese-account-db pg_isready --username postgres; do sleep 2; done
   ```
   It worked when `pg_isready` says `accepting connections` and
   `sudo ls /home/daftadmin/data/zenbu-account-api/18/docker` lists `PG_VERSION`.
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
   It worked when `docker exec zenbujapanese-account-db psql --username postgres --command '\l'`
   lists `account_staging` and `account_production`, each owned by its role. The deployer deploys
   nothing until the slots' network exists (step 4), and then deploys staging at once, whose
   `:staging` image `Account API deploy` published, so finish step 3 first: without
   `ACCOUNT_API_URL` and `ACCOUNT_API_SECRET` the service doesn't start. A deploy that fails is
   tried again when the file changes.
3. **Sign-in's settings**, in each environment's file (the settings table, above). An environment
   without its file isn't deployed, and the deployer deploys an environment again when its file
   changes, so a setting added later takes effect within 5 minutes.

   Each file is Docker's env file: one `NAME=value` a line, with no quotes (Docker keeps them as
   part of the value), no `export`, no spaces around `=`, and no line breaks in a value. Edit it
   with `sudoedit /etc/zenbujapanese-account-api/staging.env`. When every step below is done,
   staging's file holds:

   ```sh
   DATABASE_URL=<as step 2 wrote it>
   ACCOUNT_API_URL=https://api-staging.zenbujapanese.com
   ACCOUNT_API_SECRET=<openssl rand -hex 32>
   ACCOUNT_API_TRUSTED_ORIGINS=https://staging.zenbujapanese.com
   ACCOUNT_API_COOKIE_PREFIX=zenbu-staging
   APPLE_APP_BUNDLE_IDENTIFIER=com.zenbujapanese.app
   APPLE_SERVICES_IDS=<the website's Services ID>
   APPLE_TEAM_ID=W3GXL2NQQP
   APPLE_KEY_ID=<the Sign in with Apple key's ID>
   APPLE_PRIVATE_KEY=<the .p8 file on one line, each line break written as \n>
   GOOGLE_CLIENT_IDS=<web client ID>,<iOS app's client ID>,<Tomodachi's client ID>
   GOOGLE_CLIENT_SECRET=<the web client's secret>
   ACCOUNT_API_EMAIL=usesend
   USESEND_API_KEY=<the useSend API key>
   EMAIL_ALLOWED_RECIPIENTS=<the testers' addresses, or @domain, comma-separated>
   ```

   Production's file is the same but for `account_production` and its password,
   `ACCOUNT_API_URL=https://api.zenbujapanese.com`, its own `ACCOUNT_API_SECRET`,
   `ACCOUNT_API_TRUSTED_ORIGINS=https://zenbujapanese.com`, no `ACCOUNT_API_COOKIE_PREFIX`, and
   `EMAIL_ALLOWED_RECIPIENTS=everyone`. Leave `ACCOUNT_API_COOKIE_DOMAIN`, `EMAIL_FROM`, `PORT`, and
   `ACCOUNT_API_RELEASE` unset. Add the key's line without pasting the key into the terminal:
   ```sh
   printf 'APPLE_PRIVATE_KEY=%s\n' "$(awk '{printf "%s\\n", $0}' AuthKey_<key id>.p8)" |
     sudo tee -a /etc/zenbujapanese-account-api/staging.env >/dev/null
   ```
   Google can come later: leave out its two lines. So can Apple, but only all of it: leave out
   every `APPLE_*` line until the key exists, since the service won't start with
   `APPLE_APP_BUNDLE_IDENTIFIER` or `APPLE_SERVICES_IDS` and no key. Without Apple, the iOS app
   still shows its Apple button, which answers `404 provider_not_found`, so turn Apple on before
   a build that signs in reaches testers. After each edit, `journalctl -t zenbujapanese-account-api --since -10min` shows the deploy
   it made, or why the service didn't start.

   - **The service:** `ACCOUNT_API_URL` (`https://api-staging.zenbujapanese.com` or
     `https://api.zenbujapanese.com`), a new `ACCOUNT_API_SECRET` for each environment
     (`openssl rand -hex 32`), and, for the website's account pages (#468),
     `ACCOUNT_API_TRUSTED_ORIGINS`: `https://staging.zenbujapanese.com` on staging, and
     `https://zenbujapanese.com` in production. Leave `ACCOUNT_API_COOKIE_DOMAIN` unset, so the
     session cookie stays on the API host; staging may still set
     `ACCOUNT_API_COOKIE_PREFIX=zenbu-staging`.
   - **Apple** (Apple Developer, Certificates, Identifiers & Profiles, on the team that owns the
     app's ID, `W3GXL2NQQP` while the app ships from the backup account, #616):
     - **The App IDs.** Identifiers → `com.zenbujapanese.app` → Capabilities → Sign in with Apple →
       Edit → **Enable as a primary App ID** → Save. Then the same for Tomodachi's,
       `com.zenbujapanese.tomodachi`, choosing **Group with an existing primary App ID** and
       `com.zenbujapanese.app`, so a learner who allowed one app isn't asked again by the other.
       Set `APPLE_APP_BUNDLE_IDENTIFIER` to the iOS app's ID; the service also takes every app's
       bundle ID from `src/domain/clients.ts`. Regenerate each app's provisioning profiles after
       turning the capability on ([`ios.md`](ios.md)).
     - **The key.** Keys → + → a name such as "Zenbu Sign in with Apple" → Sign in with Apple →
       Configure → primary App ID `com.zenbujapanese.app` → Save → Continue → Register →
       Download. The `.p8` downloads once only: keep it in the owners' password manager. Its Key
       ID is on the key's page, and the team ID at the top right. Set `APPLE_TEAM_ID`,
       `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY`: deleting an account revokes its Apple sign-in with
       it (Deleting an account), so the service won't start with Apple and without the key, but at
       `localhost`. The service makes Apple's client secret from the key each time it starts, and
       the secret lasts 180 days, so restart a service that runs that long without a deploy.
     - **Private email relay.** A learner may hide their email from Apple, which then gives an
       `@privaterelay.appleid.com` address that takes mail only from senders the team registered.
       Services → Sign in with Apple for Email Communication → Configure → + → add the domain
       `zenbujapanese.com`, the subdomain useSend's SPF record is on (such as
       `mail.zenbujapanese.com`, if its records name one), and the address
       `support@zenbujapanese.com` → Register. Apple checks each domain's SPF, so do this after
       useSend has verified the domain (Email, below). Without it,
       a learner who hides their email gets no codes and no notices.
     - Apple's user ID for a learner is the same in every app of one team, so the iOS app and
       Tomodachi must stay in one team for an Apple sign-in to reach one account. Moving an app to
       another team (#616's transfer to the business account) changes its learners' Apple user
       IDs: before it, plan Apple's user migration for Sign in with Apple, and move both apps.
     - **For the website: a Services ID.** Identifiers → + → Services IDs → Continue, with a
       description such as "Zenbu Japanese website" and an identifier such as
       `com.zenbujapanese.web` → Register. Open it, turn on Sign in with Apple → Configure, with
       `com.zenbujapanese.app` as its primary App ID. Its domains are the website's and the API
       host's: `zenbujapanese.com`, `staging.zenbujapanese.com`, `api.zenbujapanese.com`, and
       `api-staging.zenbujapanese.com`. Its return URLs are the account page each site signs in
       from, `https://zenbujapanese.com/account/` and
       `https://staging.zenbujapanese.com/account/`, since Apple answers the website's popup only
       on the return URL's origin, and `<ACCOUNT_API_URL>/v1/auth/callback/apple` for each
       environment, for a redirect sign-in. Apple takes no `localhost` return URL. Save, then
       Continue and Save on the Services ID. The same key serves it. Set `APPLE_SERVICES_IDS` to
       its identifier, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY`, the `.p8` file's
       text with its newlines written as `\n`, and the website's `ACCOUNT_APPLE_SERVICES_ID`
       ([`web.md`](web.md), Account pages).
   - **Google** (Google Cloud console, the project that holds Zenbu's OAuth clients):
     1. **The consent screen** (Google Auth Platform → Branding): the app name "Zenbu Japanese", the
        support email `support@zenbujapanese.com`, the home page `https://zenbujapanese.com`, the
        privacy policy `https://zenbujapanese.com/legal/privacy/`, and `zenbujapanese.com` as an
        authorized domain. Data Access: only `openid`, `email`, and `profile`, which need no
        review. Audience: External, then **Publish app**, since a project left in Testing signs in
        only its listed test users.
     2. **The clients** (Clients → Create client):
        - a web client, whose redirect URIs are
          `https://api-staging.zenbujapanese.com/v1/auth/callback/google` and
          `https://api.zenbujapanese.com/v1/auth/callback/google`
          (`<ACCOUNT_API_URL>/v1/auth/callback/google`);
        - an iOS client, for the app's bundle ID (`com.zenbujapanese.app`), and one for
          Tomodachi's.

     Then set `GOOGLE_CLIENT_IDS` (the web client's, then the iOS clients') and
     `GOOGLE_CLIENT_SECRET` (the web client's), the iOS client's ID in the app's
     `ZENBU_GOOGLE_IOS_CLIENT_ID` build setting ([`ios.md`](ios.md), Account and sync), and the
     website's `ACCOUNT_GOOGLE_SIGN_IN=on` ([`web.md`](web.md), Account pages).
   - **Email**, as SERP's transactional email standard says, through useSend, as serplists.com
     sends (Email, above):
     1. **The sending domain.** In useSend (`https://app.usesend.com`, the team serplists.com
        sends from), Domains → Add domain → `zenbujapanese.com`. Add each DNS record it lists in
        Cloudflare (`zenbujapanese.com` → DNS → Records), as **DNS only**, not proxied, then Verify
        in useSend, and wait until the domain shows as verified.
     2. **Replies are read.** `support@zenbujapanese.com` receives mail before anything sends from
        it: Email Routing (`zenbujapanese.com` → Email → Email Routing → Routing rules) forwards it
        to `support+zenbujapanese@serp.co`, a verified destination ([`web.md`](web.md), Canonical
        hosts, says it does). Check the rule is there and on.
     3. **An API key.** In useSend, API Keys → Create, with sending access only, and limited to
        `zenbujapanese.com` if useSend offers it. It shows the key once. One key may serve both
        environments, or one each.
     4. **The settings.** `ACCOUNT_API_EMAIL=usesend`, `USESEND_API_KEY`, and
        `EMAIL_ALLOWED_RECIPIENTS`: the testers on staging, `everyone` in production.

     `ACCOUNT_API_EMAIL=cloudflare`, with `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_EMAIL_TOKEN`,
     still works, through Cloudflare Email Service, but isn't the plan.

     The first code staging sends shows whether useSend takes the sender's name with its address
     (`Zenbu Japanese <support@zenbujapanese.com>`); if it doesn't, set `EMAIL_FROM` to the
     address alone.
4. **nginx.** The API host's sites, `nginx/api-staging.zenbujapanese.com.conf` and
   `nginx/api.zenbujapanese.com.conf` in the nginx repository, send the account service's paths to
   the environment's alias on port 8789 ([`api-servers.md`](api-servers.md), The API host, which
   gives the site).

   **The slots' network.** Create it, not internal, since the service calls Apple, Google, and
   useSend, and connect the running nginx to it, before pulling the sites, since the nginx
   repository's `docker-compose.yml` names it:
   ```sh
   docker network create zenbujapanese-account-api
   docker network connect zenbujapanese-account-api nginx
   ```
   It worked when `docker network inspect zenbujapanese-account-api --format '{{.Internal}}'` says
   `false` and `docker inspect nginx --format '{{json .NetworkSettings.Networks}}'` names it.
5. **Cloudflare**: proxied DNS records for `api.zenbujapanese.com` and
   `api-staging.zenbujapanese.com`, and Authenticated Origin Pulls ([`api-servers.md`](api-servers.md),
   Set up the server, step 5).
6. **Backups.**
   - The AWS CLI v2, from AWS's installer:
     ```sh
     curl -fsSLo awscliv2.zip https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip
     unzip -q awscliv2.zip && sudo ./aws/install && rm -rf aws awscliv2.zip
     aws --version
     ```
   - An R2 bucket (Cloudflare dashboard → R2 Object Storage → Create bucket):
     `zenbujapanese-account-backups`, Standard storage, no public access or custom domain. In its
     Settings → Object lifecycle rules, add a rule that deletes objects 30 days after they're
     uploaded.
   - An R2 API token (R2 Object Storage → Manage API tokens → Create Account API token): Object
     Read & Write, applied to that bucket alone. It shows an Access Key ID and a Secret Access
     Key once; the S3 endpoint is `https://<account id>.r2.cloudflarestorage.com`.
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
   The script comes from a checkout of `main` (copy `apps/account-api/deploy/backups.sh` to the
   server, as for the deployer). Reinstall it the same way after it changes.
7. **The first deploy.** Run the workflow by hand (Actions → Account API deploy → Run workflow); the
   deployer starts each image within 5 minutes of its tag moving. Then, before anything relies on
   it:
   - `docker ps --filter label=zenbujapanese.account-api.slot` shows one slot for each
     environment, and `journalctl -t zenbujapanese-account-api` shows each deployed.
   - `GET /v1/health` answers `{"status":"ok"}` on `https://api-staging.zenbujapanese.com` and
     `https://api.zenbujapanese.com`, in a browser, and a dictionary route answers on the same
     host: `/healthz` names the dictionary build.
   - `GET /v1/auth/jwks` answers one key, `"alg":"EdDSA"`.
   - A request from the iOS app, on the Simulator and on a device, reaches staging. If Bot Fight
     Mode challenges it, the owners turn Bot Fight Mode off (ADR 0012), and this doc says so.
   - Run the backup by hand (`sudo zenbujapanese-account-backups`), then restore it into a new
     database (Back up and restore, above). `journalctl -t zenbujapanese-account-backups` shows
     both, and the bucket holds `staging/<time>.dump` and `production/<time>.dump`.
   - On staging, each way signs in a new learner and an existing one: a code, Apple and Google in
     the app, and Apple and Google on the website's account pages, where an Apple account is also
     deleted, which shows Apple takes the popup's code with its return URL. The same email through a
     second way is refused until it's linked. An access token from `GET /v1/auth/token` checks out
     against `GET /v1/auth/jwks`. A learner who hid their email from Apple gets the notice of a way
     in added at their relay address.
   - Once production's service answers on `https://api.zenbujapanese.com`, open the website's
     account pages there ([`web.md`](web.md), Account pages, Opening production's account
     pages).
